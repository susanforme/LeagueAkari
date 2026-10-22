import type { SgpGameSummary } from '@shared/data-adapter/wrapper'
import { matchQuerySchema, querySchema, syncSchema } from '@shared/pro/champion-pool'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReviewController } from '../review/review-controller'
import { reviewFixture } from '../review/test-fixtures'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { ChampionPoolController } from './champion-pool-controller'
import type { ChampionPoolContext } from './context'
import { sgpSummary } from './test-fixtures'

// Real SQLite transactions, with only the remote history endpoint replaced.
describe.runIf(!!process.versions.electron)('champion pool synchronization', () => {
  let database: DataSource
  let context: ChampionPoolContext
  let controller: ChampionPoolController
  const history = vi.fn()
  const request = syncSchema.parse({
    serverId: 'EUW1',
    puuid: 'player',
    name: 'Name#Tag',
    count: 40
  })
  const query = querySchema.parse(request)
  const response = (games: SgpGameSummary[]) => ({ data: { games: games.map((g) => g.data) } })
  const finished = () => vi.waitFor(() => expect(controller.status().sync.running).toBe(false))

  beforeEach(async () => {
    database = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await initializeProDatabase(database)
    history.mockReset()
    context = {
      storage: { status: 'ready', dataSource: database },
      leagueClient: {
        state: { isConnected: true },
        data: { summoner: { me: { puuid: 'player' } } }
      },
      sgp: {
        state: {
          availability: { sgpServerId: 'EUW1' },
          isTokenReady: true,
          leagueServers: { servers: { EUW1: { matchHistory: 'https://example.invalid' } } }
        },
        api: { matchHistoryQuery: { getMatchHistorySummaryByPlayerPuuid: history } }
      },
      ipc: { sendEvent: vi.fn() },
      logger: { warn: vi.fn() }
    } as unknown as ChampionPoolContext
    controller = new ChampionPoolController(context)
  })
  afterEach(async () => {
    await controller.dispose()
    await database.destroy()
  })

  it('fills new metrics from cached summaries without losing richer saved projections', async () => {
    history.mockResolvedValue(response([sgpSummary()]))
    controller.start(request)
    await finished()
    const [row] = await database.query('SELECT projection FROM PoolMatches')
    const projection = JSON.parse(row.projection)
    delete projection.killParticipation
    delete projection.visionPerMin
    projection.damageShare = 0.4
    await database.query('UPDATE PoolMatches SET projection=?', [JSON.stringify(projection)])
    const result = await controller.query(query)
    expect(result.overview.killParticipation.value).toBe(0.3)
    expect(result.items[0].visionPerMin.value).toBe(0.8)
    expect(result.items[0].damageShare.value).toBe(0.4)
  })

  it('reuses saved timelines offline, isolates their owner and honors explicit refresh', async () => {
    const fixture = reviewFixture()
    history.mockResolvedValue(response([fixture.summary]))
    await controller.archive(request)
    const reviews = new ReviewController(() => database, {
      match: async () => fixture.summary,
      details: async () => fixture.details
    })
    const report = await reviews.open({ ...request, gameId: 1, refresh: false })
    await reviews.dispose()
    Object.assign(context.leagueClient.state, { isConnected: false })
    expect(await controller.details(request, 1)).toEqual(fixture.details)
    await expect(controller.details(request, 1, true)).rejects.toThrow('disconnected')
    for (const field of ['puuid', 'serverId'] as const) {
      await database.query(`UPDATE ReviewReports SET ${field} = ? WHERE id = ?`, [
        'other',
        report.id
      ])
      await expect(controller.details(request, 1)).rejects.toThrow('disconnected')
      await database.query(`UPDATE ReviewReports SET ${field} = ? WHERE id = ?`, [
        request[field],
        report.id
      ])
    }
    await database.query(
      "UPDATE ReviewReports SET report = json_set(report, '$.details.source', 'lcu')"
    )
    await expect(controller.details(request, 1)).rejects.toThrow('disconnected')
  })

  it('paginates all matching champion games past 20 with stable order and isolated filters', async () => {
    const games = Array.from({ length: 50 }, (_, index) => {
      const game = sgpSummary(index + 1)
      game.data.json.gameCreation = 1000 + index
      return game
    })
    games[45].data.json.participants[0].championId = 64
    games[46].data.json.queueId = 450
    games[47].data.json.participants[0].teamPosition = 'TOP'
    games[48].data.json.gameVersion = '26.19.1'
    games[49].data.json.participants[0].gameEndedInEarlySurrender = true
    history.mockImplementation(async (_, options: { startIndex: number; count: number }) =>
      response(games.slice(options.startIndex, options.startIndex + options.count))
    )
    controller.start({ ...request, count: 100 })
    await finished()
    const filter = matchQuerySchema.parse({
      ...request,
      championId: 103,
      position: 'MIDDLE',
      patch: '26.20',
      from: 1000,
      to: 2000
    })
    const pages = await Promise.all(
      [1, 2, 3].map((page) => controller.matches({ ...filter, page }))
    )
    expect(pages.map((p) => p.total)).toEqual([45, 45, 45])
    expect(pages.map((p) => p.items.length)).toEqual([20, 20, 5])
    expect(pages.flatMap((p) => p.items.map((m) => m.gameId))).toEqual(
      Array.from({ length: 45 }, (_, index) => 45 - index)
    )
    expect((await controller.matches({ ...filter, page: 4 })).items).toEqual([])
    expect((await controller.matches({ ...filter, serverId: 'NA1' })).total).toBe(0)
    expect((await controller.matches({ ...filter, puuid: 'another-player' })).total).toBe(0)
    expect((await controller.matches({ ...filter, from: 1040 })).total).toBe(5)
    expect((await controller.matches({ ...filter, pageSize: 50 })).items).toHaveLength(45)
    Object.assign(context.leagueClient.state, { isConnected: false })
    expect((await controller.matches(filter)).total).toBe(45)
    await expect(controller.details(request, 1)).rejects.toThrow('disconnected')
    expect(await controller.details({ ...request, puuid: 'another-player' }, 1)).toBeNull()
  })

  it('deduplicates pages and retries, preserves richer data, and isolates server/player keys', async () => {
    history.mockResolvedValue(response(Array.from({ length: 20 }, (_, i) => sgpSummary(i + 1))))
    controller.start(request)
    expect(() => controller.start(request)).toThrow('busy')
    await finished()
    expect(history).toHaveBeenCalledTimes(2)
    expect((await controller.query(query)).localMatches).toBe(20)
    const partial = sgpSummary()
    partial.data.json.participants.splice(1)
    history.mockResolvedValue(response([partial]))
    controller.start(request)
    await finished()
    const pool = await controller.query(query)
    expect(pool.items[0].damageShare.value).toBeCloseTo(0.2)
    expect((await controller.match(request, 1))?.source).toBe('sgp')
    expect((await controller.query({ ...query, serverId: 'NA1' })).localMatches).toBe(0)
    expect(await controller.match({ ...request, puuid: 'another-player' }, 1)).toBeNull()
  })

  it('retains completed pages when cancelled and never writes an in-flight page afterward', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void
    history
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => sgpSummary(i + 1))))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    controller.start(request)
    await vi.waitFor(() => expect(controller.status().sync.processed).toBe(20))
    controller.cancel()
    resolve(response([sgpSummary(21)]))
    await finished()
    expect(controller.status().sync.cancelled).toBe(true)
    expect((await controller.query(query)).localMatches).toBe(20)
  })

  it('rejects results fetched across a client account switch', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void
    history.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    controller.start(request)
    context.leagueClient.data.summoner.me!.puuid = 'another-account'
    resolve(response([sgpSummary()]))
    await finished()
    expect(controller.status().sync.error).toBe('syncFailed')
    expect((await controller.query(query)).localMatches).toBe(0)
  })

  it('does not cache a malformed page under the requested player', async () => {
    const other = sgpSummary(2)
    other.data.json.participants[0].puuid = 'another-player'
    history.mockResolvedValue(response([sgpSummary(), other]))
    controller.start(request)
    await finished()
    expect(controller.status().sync.error).toBe('syncFailed')
    expect((await controller.query(query)).localMatches).toBe(0)
  })
  it('stops at the cached boundary even when the newest page also contains new games', async () => {
    history.mockResolvedValueOnce(response([sgpSummary(1)]))
    await controller.archive(request)
    history.mockClear()
    history.mockResolvedValue(response(Array.from({ length: 20 }, (_, i) => sgpSummary(20 - i))))
    await controller.archive(request)
    expect(history).toHaveBeenCalledTimes(1)
    expect((await controller.query(query)).localMatches).toBe(20)
  })
  it('archives only missing games and retries only the failed page', async () => {
    const first = Array.from({ length: 20 }, (_, i) => sgpSummary(i + 1))
    history.mockResolvedValueOnce(response(first)).mockRejectedValueOnce(new Error('offline'))
    await expect(controller.archive(request)).rejects.toThrow('Archive incomplete')
    expect((await controller.query(query)).localMatches).toBe(20)
    history.mockResolvedValueOnce(response([sgpSummary(21)]))
    controller.retry()
    await finished()
    expect(history.mock.calls[2][1].startIndex).toBe(20)
    expect((await controller.query(query)).localMatches).toBe(21)
    const changed = sgpSummary(1)
    changed.data.json.participants[0].kills = 99
    history.mockResolvedValue(response([changed]))
    await controller.archive(request)
    const existing = await controller.match(request, 1)
    expect(existing?.source === 'sgp' && existing.data.json.participants[0].kills).not.toBe(99)
  })
})
