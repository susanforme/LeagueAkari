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
    await database.query("INSERT INTO NotebookLoadoutState VALUES ('preferences', ?)", [
      JSON.stringify({ flashSlot: 'D', forceFlash: true })
    ])
    await database.query('INSERT INTO NotebookFavorites VALUES (103)')
    await database.query('INSERT INTO HandbookChampions VALUES (103,1,1,?)', [
      JSON.stringify({ summary: 'My guide' })
    ])
    await database.query('INSERT INTO PracticePlans VALUES (?,?,?,?,?)', [
      'plan',
      103,
      1,
      1,
      JSON.stringify({ title: 'Practice' })
    ])
    await database.query('INSERT INTO PracticeSessions VALUES (?,?,?,?)', [
      'session',
      'plan',
      1,
      JSON.stringify({ durationSeconds: 600 })
    ])
    await backups.exportFile()
    await database.query('DELETE FROM NotebookFavorites')
    for (const table of ['HandbookChampions', 'PracticePlans', 'PracticeSessions'])
      await database.query(`DELETE FROM ${table}`)
    await database.query("UPDATE PoolPlayers SET name='After'")
    await database.query('DELETE FROM NotebookLoadoutState')
    const preview = await backups.prepareFile()
    expect(preview).toMatchObject({ version: 10, entries: 0, matches: 0 })
    await backups.stage(preview!.token)
    expect((await database.query('SELECT name FROM PoolPlayers'))[0].name).toBe('After')
    await backups.applyPending()
    expect((await database.query('SELECT name FROM PoolPlayers'))[0].name).toBe('Before')
    expect(await database.query('SELECT * FROM NotebookFavorites')).toEqual([{ championId: 103 }])
    expect(await database.query('SELECT championId FROM HandbookChampions')).toEqual([
      { championId: 103 }
    ])
    expect(await database.query('SELECT id FROM PracticePlans')).toEqual([{ id: 'plan' }])
    expect(await database.query('SELECT planId FROM PracticeSessions')).toEqual([
      { planId: 'plan' }
    ])
    expect(
      JSON.parse(
        (
          await database.query("SELECT payload FROM NotebookLoadoutState WHERE key='preferences'")
        )[0].payload
      )
    ).toEqual({ flashSlot: 'D', forceFlash: false })
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
  it('restores v6 backups after upgrading them and retains v7 plan payloads in new backups', async () => {
    await database.query("INSERT INTO ExperiencePlans VALUES ('EUW1','player',1,?)", [
      JSON.stringify({ revision: 1, focus: null, session: null })
    ])
    await backups.exportFile()
    const preview = await backups.prepareFile()
    await database.query('DELETE FROM ExperiencePlans')
    await backups.stage(preview!.token)
    await backups.applyPending()
    expect((await database.query('SELECT revision FROM ExperiencePlans'))[0].revision).toBe(1)
    const legacyPath = join(directory, 'legacy.db')
    await database.query('VACUUM INTO ?', [legacyPath])
    const legacy = new DataSource({ type: 'better-sqlite3', database: legacyPath })
    await legacy.initialize()
    await legacy.query('DROP TABLE ExperiencePlans')
    await legacy.query('DROP TABLE NotebookFavorites')
    await legacy.query('DROP TABLE NotebookLoadoutState')
    await legacy.query('DROP TABLE IF EXISTS HandbookChampions')
    await legacy.query('DROP TABLE IF EXISTS PracticePlans')
    await legacy.query('DROP TABLE IF EXISTS PracticeSessions')
    await legacy.query('PRAGMA user_version=6')
    await legacy.destroy()
    dialogs.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [legacyPath] })
    const old = await backups.prepareFile()
    expect(old?.version).toBe(6)
    await backups.stage(old!.token)
    await backups.applyPending()
    expect(await database.query('SELECT * FROM ExperiencePlans')).toEqual([])
    expect((await database.query('PRAGMA user_version'))[0].user_version).toBe(10)
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
    await foreign.query('DROP TABLE IF EXISTS HandbookChampions')
    await foreign.query('DROP TABLE IF EXISTS PracticePlans')
    await foreign.query('DROP TABLE IF EXISTS PracticeSessions')
    await foreign.query('PRAGMA user_version=5')
    await foreign.query(
      'CREATE TRIGGER bad AFTER INSERT ON PoolPlayers BEGIN DELETE FROM PoolPlayers; END'
    )
    await foreign.destroy()
    await expect(backups.prepareFile()).rejects.toThrow('schema')
    expect((await database.query('PRAGMA user_version'))[0].user_version).toBe(10)
  })
})
