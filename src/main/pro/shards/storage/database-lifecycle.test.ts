import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NewerDatabaseVersionError, initializeProDatabase } from './database-lifecycle'
import { initializeChampionPool } from './upgrades/version-1'
import { initializeResourceCache } from './upgrades/version-2'
import { initializeNotebooks } from './upgrades/version-3'
import { initializeReviewsAndProfiles } from './upgrades/version-4'

// The installed native addon targets Electron's ABI; run this suite with Electron as Node.
describe.runIf(!!process.versions.electron)('pro SQLite lifecycle', () => {
  let directory: string
  let source: DataSource
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akari-pro-db-'))
    source = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'ProFeatures.db'),
      synchronize: false,
      entities: []
    })
  })
  afterEach(async () => {
    if (source.isInitialized) await source.destroy()
    await rm(directory, { recursive: true, force: true })
  })

  it('creates the separate schema and reopens persistent data without resetting it', async () => {
    await initializeProDatabase(source)
    await source.query("INSERT INTO PoolPlayers VALUES ('EUW1', 'player', 'Name#Tag', 123)")
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT name FROM PoolPlayers')).toEqual([{ name: 'Name#Tag' }])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 7 }])
  })

  it('upgrades version 1 without losing cached matches or players', async () => {
    await source.initialize()
    await source.transaction(initializeChampionPool)
    await source.query("INSERT INTO PoolPlayers VALUES ('EUW1', 'player', 'Keep#Tag', 123)")
    await source.query('PRAGMA user_version = 1')
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT name FROM PoolPlayers')).toEqual([{ name: 'Keep#Tag' }])
    expect(await source.query('SELECT * FROM PoolResources')).toEqual([])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 7 }])
  })

  it('upgrades the notebook database while retaining notes and rolls back version 4 on failure', async () => {
    await source.initialize()
    await source.transaction(async (manager) => {
      await initializeChampionPool(manager)
      await initializeResourceCache(manager)
      await initializeNotebooks(manager)
      await manager.query("INSERT INTO NotebookResources VALUES ('keep', '{}', 1)")
      await manager.query('PRAGMA user_version = 3')
    })
    await source.query('CREATE TABLE ProfileSnapshots (sentinel TEXT)')
    await source.query("INSERT INTO ProfileSnapshots VALUES ('keep')")
    await source.destroy()
    await expect(initializeProDatabase(source)).rejects.toThrow()
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 3 }])
    expect(
      await source.query("SELECT name FROM sqlite_master WHERE name = 'ReviewReports'")
    ).toEqual([])
    expect(await source.query('SELECT sentinel FROM ProfileSnapshots')).toEqual([
      { sentinel: 'keep' }
    ])
    await source.query('DROP TABLE ProfileSnapshots')
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT key FROM NotebookResources')).toEqual([{ key: 'keep' }])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 7 }])
  })

  it('rolls back a failed v5 upgrade and preserves v4 content before retrying', async () => {
    await source.initialize()
    await source.transaction(async (manager) => {
      await initializeChampionPool(manager)
      await initializeResourceCache(manager)
      await initializeNotebooks(manager)
      await initializeReviewsAndProfiles(manager)
      await manager.query('PRAGMA user_version=4')
    })
    await source.query("INSERT INTO NotebookResources VALUES ('keep','{}',1)")
    await source.query('CREATE TABLE TrainingGoals(sentinel TEXT)')
    await source.destroy()
    await expect(initializeProDatabase(source)).rejects.toThrow()
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 4 }])
    expect(
      await source.query("SELECT name FROM sqlite_master WHERE name='NotebookPractice'")
    ).toEqual([])
    await source.query('DROP TABLE TrainingGoals')
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT key FROM NotebookResources')).toEqual([{ key: 'keep' }])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 7 }])
  })

  it('rejects a future schema without changing existing data', async () => {
    await source.initialize()
    await source.query('CREATE TABLE FutureData (value TEXT)')
    await source.query("INSERT INTO FutureData VALUES ('keep')")
    await source.query('PRAGMA user_version = 99')
    await source.destroy()
    await expect(initializeProDatabase(source)).rejects.toBeInstanceOf(NewerDatabaseVersionError)
    expect(await source.query('SELECT * FROM FutureData')).toEqual([{ value: 'keep' }])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 99 }])
  })
  it('upgrades v5 with existing content and rolls back the complete v6 migration on failure', async () => {
    await initializeProDatabase(source)
    for (const table of [
      'ExperiencePreferences',
      'ExperienceWorkspaces',
      'ExperienceScenes',
      'ExperiencePlans'
    ])
      await source.query(`DROP TABLE ${table}`)
    await source.query('PRAGMA user_version=5')
    await source.query("INSERT INTO PoolPlayers VALUES ('EUW1','player','Keep',1)")
    await source.query('CREATE TABLE ExperienceScenes(sentinel TEXT)')
    await source.destroy()
    await expect(initializeProDatabase(source)).rejects.toThrow()
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 5 }])
    expect(
      await source.query("SELECT name FROM sqlite_master WHERE name='ExperienceWorkspaces'")
    ).toEqual([])
    await source.query('DROP TABLE ExperienceScenes')
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT name FROM PoolPlayers')).toEqual([{ name: 'Keep' }])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 7 }])
  })

  it('rolls back a failed migration and preserves the pre-existing table', async () => {
    await source.initialize()
    await source.query('CREATE TABLE PoolMatches (sentinel TEXT)')
    await source.query("INSERT INTO PoolMatches VALUES ('keep')")
    await source.destroy()
    await expect(initializeProDatabase(source)).rejects.toThrow()
    expect(await source.query('SELECT * FROM PoolMatches')).toEqual([{ sentinel: 'keep' }])
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'PoolPlayers'")).toEqual(
      []
    )
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 0 }])
  })
  it('upgrades v6 with existing notes and rolls back a failed v7 upgrade without losing them', async () => {
    await initializeProDatabase(source)
    await source.query('DROP TABLE ExperiencePlans')
    await source.query('PRAGMA user_version=6')
    await source.query("INSERT INTO NotebookResources VALUES ('kept', '{}', 1)")
    await source.query('CREATE TABLE ExperiencePlans(sentinel TEXT)')
    await source.query("INSERT INTO ExperiencePlans VALUES ('kept')")
    await source.destroy()
    await expect(initializeProDatabase(source)).rejects.toThrow()
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 6 }])
    expect(await source.query('SELECT * FROM ExperiencePlans')).toEqual([{ sentinel: 'kept' }])
    await source.query('DROP TABLE ExperiencePlans')
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT key FROM NotebookResources')).toEqual([{ key: 'kept' }])
    expect(await source.query('SELECT * FROM ExperiencePlans')).toEqual([])
    expect(await source.query('PRAGMA user_version')).toEqual([{ user_version: 7 }])
  })
})
