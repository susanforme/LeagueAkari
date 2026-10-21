import type { LeagueClientMain } from '@main/shards/league-client'
import type { SgpMain } from '@main/shards/sgp'
import { type NotebookEntry, blankContent } from '@shared/pro/notebook'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import { BuildSyncController, clientItemSet } from './build-sync-controller'
import { NotebookController } from './notebook-controller'

describe.runIf(!!process.versions.electron)('client item-set synchronization', () => {
  let directory: string,
    database: DataSource,
    notebooks: NotebookController,
    builds: BuildSyncController,
    entry: NotebookEntry
  let collection: { itemSets: Record<string, unknown>[]; accountId: number }
  const get = vi.fn(),
    put = vi.fn(),
    league = {
      state: { isConnected: true, auth: { pid: 1 } },
      data: {
        summoner: { me: { puuid: 'player', summonerId: 42 } },
        gameflow: { phase: 'Lobby', session: { map: { id: 11 } } },
        champSelect: {
          session: {
            id: 1,
            localPlayerCellId: 0,
            isSpectating: false,
            myTeam: [{ cellId: 0, championId: 103 }]
          }
        },
        gameData: { items: { 1001: {} } }
      },
      http: { get, put }
    }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akari-build-'))
    database = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'pro.db'),
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(database)
    notebooks = new NotebookController(() => database)
    entry = await notebooks.save({
      id: null,
      expectedRevision: 0,
      content: {
        ...blankContent(103, 'build'),
        title: 'Boots',
        groups: [{ name: 'Start', items: [{ id: 1001, count: 1 }] }]
      }
    })
    collection = { accountId: 42, itemSets: [{ uid: 'unrelated', title: 'Keep', blocks: [] }] }
    league.data.summoner.me.puuid = 'player'
    league.data.gameflow.phase = 'Lobby'
    get.mockReset().mockImplementation(async () => ({ data: structuredClone(collection) }))
    put.mockReset().mockImplementation(async (_path, data) => {
      collection = structuredClone(data)
      return { data: {} }
    })
    builds = new BuildSyncController(
      () => database,
      notebooks,
      league as unknown as LeagueClientMain,
      { state: { availability: { sgpServerId: 'EUW1' } } } as SgpMain,
      () => {}
    )
  })
  afterEach(async () => {
    await builds.dispose()
    await notebooks.dispose()
    await database.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  const request = () => ({ entryId: entry.id, expectedRevision: 1, mode: 'apply' as const })
  it('honors the loadout context guard before an item-set write', async () => {
    let changed = false
    get.mockImplementationOnce(async () => {
      changed = true
      return { data: collection }
    })
    await expect(
      builds.apply(request(), undefined, () => {
        if (changed) throw new Error('Session changed')
      })
    ).rejects.toThrow('Session changed')
    expect(put).not.toHaveBeenCalled()
  })
  it('preserves unrelated sets, verifies writes, and makes repeated application idempotent', async () => {
    expect(clientItemSet(entry, 'x')).toMatchObject({
      associatedMaps: [11],
      blocks: [{ items: [{ id: '1001', count: 1 }] }]
    })
    expect(await builds.apply(request())).toEqual({ state: 'applied' })
    expect(collection.itemSets[0]).toEqual({ uid: 'unrelated', title: 'Keep', blocks: [] })
    await builds.apply(request())
    expect(put).toHaveBeenCalledTimes(1)
    collection.itemSets[1].title = 'Edited in client'
    await expect(builds.apply(request())).rejects.toThrow('conflict')
    await builds.apply({ ...request(), mode: 'new' })
    expect(collection.itemSets).toHaveLength(3)
    expect(collection.itemSets[1].title).toBe('Edited in client')
  })
  it('applies an explicitly enabled rule only in the matching champion and map selection', async () => {
    league.data.gameflow.phase = 'ChampSelect'
    league.data.gameflow.session.map.id = 12
    await builds.setRule(entry.id, true)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(put).not.toHaveBeenCalled()
    league.data.gameflow.session.map.id = 11
    await builds.setRule(entry.id, true)
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(builds.status.state).toBe('applied'))
  })

  it('does not write after an account change, and reconciles an uncertain successful PUT', async () => {
    get.mockImplementationOnce(async () => {
      league.data.summoner.me.puuid = 'another'
      return { data: collection }
    })
    await expect(builds.apply(request())).rejects.toThrow('Session changed')
    expect(put).not.toHaveBeenCalled()
    league.data.summoner.me.puuid = 'player'
    league.data.gameflow.phase = 'Lobby'
    put.mockImplementationOnce(async (_path, data) => {
      collection = structuredClone(data)
      throw new Error('timeout')
    })
    await expect(builds.apply(request())).rejects.toThrow('timeout')
    expect(builds.status.state).toBe('pending')
    expect(await builds.apply(request())).toEqual({ state: 'applied' })
    expect(put).toHaveBeenCalledTimes(1)
  })
})
