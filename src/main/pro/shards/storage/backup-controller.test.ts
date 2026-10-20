import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackupController } from './backup-controller'
import { initializeProDatabase } from './database-lifecycle'

const dialogs = vi.hoisted(() => ({ showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }))
vi.mock('electron', () => ({ dialog: dialogs }))

describe.runIf(!!process.versions.electron)('pro backups', () => {
  let directory: string, database: DataSource, backups: BackupController, path: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akari-backup-'))
    database = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'ProFeatures.db'),
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(database)
    backups = new BackupController(() => database, directory)
    path = join(directory, 'export.db')
    dialogs.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path })
    dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] })
  })
  afterEach(async () => {
    await backups.dispose()
    await database.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  it('previews and stages without changing data, then atomically restores with a recovery copy', async () => {
    await database.query("INSERT INTO PoolPlayers VALUES ('EUW1','player','Before',1)")
    await backups.exportFile()
    await database.query("UPDATE PoolPlayers SET name='After'")
    const preview = await backups.prepareFile()
    expect(preview).toMatchObject({ version: 6, entries: 0, matches: 0 })
    await backups.stage(preview!.token)
    expect((await database.query('SELECT name FROM PoolPlayers'))[0].name).toBe('After')
    await backups.applyPending()
    expect((await database.query('SELECT name FROM PoolPlayers'))[0].name).toBe('Before')
    const saved = await readdir(join(directory, 'pro-backups'))
    expect(saved).toHaveLength(1)
    const recovery = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'pro-backups', saved[0]),
      readonly: true,
      entities: []
    })
    await recovery.initialize()
    try {
      expect((await recovery.query('SELECT name FROM PoolPlayers'))[0].name).toBe('After')
    } finally {
      await recovery.destroy()
    }
  })
  it('rolls back all copied tables if a restore write fails', async () => {
    await database.query("INSERT INTO PoolPlayers VALUES ('EUW1','player','Backup',1)")
    await backups.exportFile()
    await database.query("UPDATE PoolPlayers SET name='Current'")
    const preview = await backups.prepareFile()
    await backups.stage(preview!.token)
    await database.query(
      "CREATE TRIGGER reject_restore BEFORE INSERT ON PoolPlayers BEGIN SELECT RAISE(ABORT,'no write'); END"
    )
    await expect(backups.applyPending()).rejects.toThrow('no write')
    expect((await database.query('SELECT name FROM PoolPlayers'))[0].name).toBe('Current')
    expect(backups.status).toBe('restoreFailed')
  })
  it('rejects corrupt, newer, and foreign schemas without replacing current data', async () => {
    await writeFile(path, 'broken')
    await expect(backups.prepareFile()).rejects.toThrow()
    await rm(path)
    await backups.exportFile()
    const foreign = new DataSource({ type: 'better-sqlite3', database: path, entities: [] })
    await foreign.initialize()
    await foreign.query('PRAGMA user_version=99')
    await foreign.destroy()
    await expect(backups.prepareFile()).rejects.toThrow('version')
    await foreign.initialize()
    await foreign.query('PRAGMA user_version=5')
    await foreign.query(
      'CREATE TRIGGER bad AFTER INSERT ON PoolPlayers BEGIN DELETE FROM PoolPlayers; END'
    )
    await foreign.destroy()
    await expect(backups.prepareFile()).rejects.toThrow('schema')
    expect((await database.query('PRAGMA user_version'))[0].user_version).toBe(6)
  })
})
