import { dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, realpath, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'

import { PRO_DATABASE_VERSION, initializeProDatabase } from './database-lifecycle'

const tables = [
  'PoolPlayers',
  'PoolMatches',
  'PoolResources',
  'NotebookEntries',
  'NotebookRevisions',
  'NotebookResources',
  'ReviewReports',
  'ProfileSnapshots',
  'NotebookPractice',
  'TrainingGoals',
  'ReviewBatches',
  'BuildSyncRules',
  'BuildApplications',
  'ExperiencePreferences',
  'ExperienceWorkspaces',
  'ExperienceScenes',
  'ExperiencePlans',
  'NotebookLoadoutState'
] as const
export class BackupController {
  private _prepared: { token: string; path: string } | null = null
  private _busy = false
  status: string | null = null
  constructor(
    private readonly _database: () => DataSource,
    private readonly _directory: string
  ) {}
  private get _pending() {
    return join(this._directory, 'ProFeatures.restore.db')
  }
  private async _validate(path: string) {
    if ((await stat(path)).size > 1024 * 1024 * 1024) throw new Error('Backup exceeds 1 GB')
    const candidate = new DataSource({
      type: 'better-sqlite3',
      database: path,
      readonly: true,
      entities: [],
      synchronize: false
    })
    try {
      await candidate.initialize()
      const [{ user_version: version }] = await candidate.query('PRAGMA user_version')
      if (!Number.isInteger(version) || version < 4 || version > PRO_DATABASE_VERSION)
        throw new Error('Unsupported backup version')
      const integrity = await candidate.query('PRAGMA integrity_check')
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
        throw new Error('Invalid backup')
      const schema = await candidate.query(
        "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
      )
      if (
        schema.some(
          (r: { type: string; name: string; sql: string }) =>
            !['table', 'index'].includes(r.type) ||
            /VIRTUAL/i.test(r.sql ?? '') ||
            (r.type === 'table' && !tables.includes(r.name as (typeof tables)[number]))
        )
      )
        throw new Error('Invalid backup schema')
      const expected =
        version === 4
          ? tables.slice(0, 8)
          : version === 5
            ? tables.slice(0, 13)
            : version === 6
              ? tables.slice(0, 16)
              : version === 7
                ? tables.slice(0, 17)
                : tables
      if (schema.filter((r: { type: string }) => r.type === 'table').length !== expected.length)
        throw new Error('Invalid backup schema')
      // Compare columns against our schema before executing migrations or reading any business data.
      for (const table of expected) {
        const actual = await candidate.query(`PRAGMA table_info("${table}")`),
          own = await this._database().query(`PRAGMA table_info("${table}")`)
        if (JSON.stringify(actual) !== JSON.stringify(own)) throw new Error('Invalid backup schema')
      }
      return {
        version,
        entries: (await candidate.query('SELECT COUNT(*) n FROM NotebookEntries'))[0].n as number,
        matches: (await candidate.query('SELECT COUNT(*) n FROM PoolMatches'))[0].n as number
      }
    } finally {
      if (candidate.isInitialized) await candidate.destroy()
    }
  }
  private async _snapshot(path: string) {
    await this._database().query('VACUUM INTO ?', [path])
  }
  async exportFile() {
    if (this._busy) throw new Error('busy')
    this._busy = true
    const temporary = join(this._directory, `pro-backup-${randomUUID()}.db`)
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: `akari-pro-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: 'SQLite', extensions: ['db'] }]
      })
      if (result.canceled || !result.filePath) return false
      // Never let a file picker overwrite the live database or a staged restore.
      const target = await realpath(result.filePath).catch(() => resolve(result.filePath))
      const protectedPaths = [
        this._pending,
        ...['ProFeatures.db', 'LeagueAkari.db'].flatMap((name) =>
          ['', '-wal', '-shm'].map((suffix) => join(this._directory, name + suffix))
        )
      ]
      for (const path of protectedPaths) {
        const own = await realpath(path).catch(() => resolve(path))
        if (
          (process.platform === 'win32' ? own.toLowerCase() : own) ===
          (process.platform === 'win32' ? target.toLowerCase() : target)
        )
          throw new Error('Cannot replace active data')
      }
      const destination = `${result.filePath}.${randomUUID()}.tmp`
      try {
        await this._snapshot(temporary)
        await copyFile(temporary, destination)
        await rename(destination, result.filePath)
      } finally {
        await rm(destination, { force: true })
      }
      return true
    } finally {
      await rm(temporary, { force: true })
      this._busy = false
    }
  }
  async prepareFile() {
    if (this._busy) throw new Error('busy')
    this._busy = true
    const path = join(this._directory, `pro-restore-${randomUUID()}.db`)
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['db'] }]
      })
      if (result.canceled) return null
      if ((await stat(result.filePaths[0])).size > 1024 * 1024 * 1024)
        throw new Error('Backup exceeds 1 GB')
      await copyFile(result.filePaths[0], path)
      const info = await this._validate(path)
      const candidate = new DataSource({
        type: 'better-sqlite3',
        database: path,
        entities: [],
        synchronize: false
      })
      try {
        await initializeProDatabase(candidate)
      } finally {
        if (candidate.isInitialized) await candidate.destroy()
      }
      if (this._prepared) await rm(this._prepared.path, { force: true })
      this._prepared = { token: randomUUID(), path }
      return { ...info, token: this._prepared.token }
    } catch (error) {
      await rm(path, { force: true })
      throw error
    } finally {
      this._busy = false
    }
  }
  async stage(token: string) {
    if (this._busy || !this._prepared || this._prepared.token !== token)
      throw new Error('Restore preview expired')
    this._busy = true
    try {
      await this._validate(this._prepared.path)
      await rename(this._prepared.path, this._pending)
      this._prepared = null
      this.status = 'restoreScheduled'
      return true
    } finally {
      this._busy = false
    }
  }
  async applyPending() {
    try {
      await this._applyPending()
    } catch (error) {
      this.status = 'restoreFailed'
      await rename(
        this._pending,
        join(this._directory, `ProFeatures.restore-failed-${randomUUID()}.db`)
      ).catch(() => {})
      throw error
    }
  }
  private async _applyPending() {
    try {
      await stat(this._pending)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    await this._validate(this._pending)
    const pending = new DataSource({
      type: 'better-sqlite3',
      database: this._pending,
      entities: [],
      synchronize: false
    })
    try {
      await initializeProDatabase(pending)
    } finally {
      if (pending.isInitialized) await pending.destroy()
    }
    const directory = join(this._directory, 'pro-backups')
    await mkdir(directory, { recursive: true })
    await this._snapshot(join(directory, `before-restore-${Date.now()}-${randomUUID()}.db`))
    const database = this._database()
    const consumed = join(this._directory, `ProFeatures.restoring-${randomUUID()}.db`)
    // Consume the request before committing: a cleanup failure must never replay a restore on later launches.
    await rename(this._pending, consumed)
    await database.query('ATTACH DATABASE ? AS pro_restore', [consumed])
    try {
      await database.transaction(async (manager) => {
        for (const table of tables) {
          await manager.query(`DELETE FROM "${table}"`)
          await manager.query(`INSERT INTO "${table}" SELECT * FROM pro_restore."${table}"`)
        }
        // Credentials are never backed up; automatic client writes require a fresh opt-in after restore.
        await manager.query('UPDATE BuildSyncRules SET enabled=0')
        await manager.query(
          "UPDATE NotebookLoadoutState SET payload=json_set(payload, '$.forceFlash', json('false')) WHERE key='preferences' AND json_valid(payload)"
        )
        await manager.query('DELETE FROM BuildApplications')
      })
    } finally {
      await database.query('DETACH DATABASE pro_restore')
    }
    this.status = 'restoreApplied'
    await rm(consumed, { force: true }).catch(() => {})
  }
  async dispose() {
    if (this._prepared) await rm(this._prepared.path, { force: true })
  }
}
