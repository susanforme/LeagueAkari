import type { AkariIpcMain } from '@main/shards/ipc'
import type { LeagueClientMain } from '@main/shards/league-client'
import type { AkariLogger } from '@main/shards/logger-factory'
import type { SgpMain } from '@main/shards/sgp'
import { profileMatchesSchema, profileTrendSchema } from '@shared/pro/profile'
import { RadixEventEmitter } from '@shared/utils/event-emitter'
import { observable, runInAction } from 'mobx'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sgpSummary } from '../champion-pool/test-fixtures'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { registerProfileHandlers } from './ipc-handlers'
import { ProfileController } from './profile-controller'

describe.runIf(!!process.versions.electron)('personal rank snapshots', () => {
  let source: DataSource
  let controller: ProfileController
  let leagueClient: any
  let sgp: any
  const ranked = {
    queues: [
      {
        queueType: 'RANKED_SOLO_5x5',
        tier: 'GOLD',
        division: 'II',
        leaguePoints: 23,
        wins: 15,
        losses: 10,
        isProvisional: false
      }
    ],
    seasons: { RANKED_SOLO_5x5: { currentSeasonId: 2026, currentSeasonEnd: 1, nextSeasonStart: 2 } }
  }
  beforeEach(async () => {
    vi.useFakeTimers()
    source = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(source)
    leagueClient = {
      state: observable({ isConnected: true, auth: { pid: 1 } }),
      data: observable({
        summoner: {
          me: {
            puuid: 'player',
            gameName: 'Test',
            tagLine: 'ONE',
            summonerLevel: 100,
            profileIconId: 1
          }
        }
      }),
      events: new RadixEventEmitter(),
      api: { ranked: { getCurrentRankedStats: vi.fn(async () => ({ data: ranked })) } }
    }
    sgp = { state: observable({ availability: { sgpServerId: 'EUW1' } }) }
    controller = new ProfileController(
      () => source,
      leagueClient as LeagueClientMain,
      sgp as SgpMain,
      { warn: vi.fn() } as unknown as AkariLogger
    )
    controller.start()
  })
  afterEach(async () => {
    await controller.dispose()
    await source.destroy()
    vi.useRealTimers()
  })
  it('records every successful capture, including unchanged ranks, and paginates by account', async () => {
    await vi.advanceTimersByTimeAsync(1500)
    for (let i = 0; i < 31; i++) await controller.capture()
    expect((await controller.history({ serverId: 'EUW1', puuid: 'player' }, 1)).items).toHaveLength(
      30
    )
    expect((await controller.history({ serverId: 'EUW1', puuid: 'player' }, 2)).items).toHaveLength(
      2
    )
    expect((await controller.players())[0].ranked).toEqual(ranked)
    runInAction(() => {
      sgp.state.availability.sgpServerId = 'NA1'
    })
    await controller.capture()
    expect(await controller.players()).toHaveLength(2)
    expect((await controller.history({ serverId: 'NA1', puuid: 'player' }, 1)).total).toBe(1)
  })
  it('rejects a previous account response after switch, and never writes malformed API results', async () => {
    let resolve!: (value: unknown) => void
    leagueClient.api.ranked.getCurrentRankedStats.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = controller.capture()
    const rejected = expect(pending).rejects.toThrow('Client changed')
    runInAction(() => {
      leagueClient.data.summoner.me.puuid = 'second'
    })
    resolve({ data: ranked })
    await rejected
    expect(await controller.players()).toEqual([])
    leagueClient.api.ranked.getCurrentRankedStats.mockResolvedValueOnce({
      data: { queues: [{ leaguePoints: 'unknown' }] }
    })
    await expect(controller.capture()).rejects.toThrow()
    expect(await controller.players()).toEqual([])
    await controller.capture()
    expect((await controller.players())[0].puuid).toBe('second')
  })
  it('captures ranked/end-game events with debounce and stops after disposal', async () => {
    await vi.advanceTimersByTimeAsync(1500)
    leagueClient.events.emit('/lol-ranked/v1/current-ranked-stats', { data: ranked })
    leagueClient.events.emit('/lol-gameflow/v1/gameflow-phase', { data: 'EndOfGame' })
    await vi.advanceTimersByTimeAsync(1500)
    const result = await controller.history({ serverId: 'EUW1', puuid: 'player' }, 1)
    expect(result.total).toBe(2)
    expect(result.items[0].reason).toBe('endGame')
    await controller.dispose()
    leagueClient.events.emit('/lol-ranked/v1/current-ranked-stats', { data: ranked })
    await vi.advanceTimersByTimeAsync(5000)
    expect(leagueClient.api.ranked.getCurrentRankedStats).toHaveBeenCalledTimes(2)
  })
  it('filters full curves by account, queue and season, retaining equal-time and unchanged captures', async () => {
    const ids: string[] = []
    for (let i = 0; i < 32; i++) ids.push((await controller.capture()).id)
    const oldSeason = structuredClone(ranked)
    oldSeason.seasons.RANKED_SOLO_5x5.currentSeasonId = 2025
    leagueClient.api.ranked.getCurrentRankedStats.mockResolvedValueOnce({ data: oldSeason })
    await controller.capture()
    const flex = {
      queues: [{ ...ranked.queues[0], queueType: 'RANKED_FLEX_SR', tier: 'PLATINUM' }],
      seasons: {
        RANKED_FLEX_SR: { currentSeasonId: 2024, currentSeasonEnd: 1, nextSeasonStart: 2 }
      }
    }
    leagueClient.api.ranked.getCurrentRankedStats.mockResolvedValueOnce({ data: flex })
    await controller.capture()
    leagueClient.api.ranked.getCurrentRankedStats.mockResolvedValueOnce({
      data: { queues: ranked.queues }
    })
    const unknown = await controller.capture()
    const query = profileTrendSchema.parse({
      serverId: 'EUW1',
      puuid: 'player',
      queue: 'RANKED_SOLO_5x5'
    })
    const result = await controller.trend(query)
    expect(result.seasons).toEqual([2026, 2025, null])
    expect(result.season).toBe(2026)
    expect(result.points.map((point) => point.id)).toEqual(ids)
    expect((await controller.trend({ ...query, season: 2025 })).points).toHaveLength(1)
    expect((await controller.trend({ ...query, season: null })).points[0].id).toBe(unknown.id)
    expect(await controller.trend({ ...query, queue: 'RANKED_FLEX_SR' })).toMatchObject({
      season: 2024,
      seasons: [2024],
      points: [{ tier: 'PLATINUM' }]
    })
    expect((await controller.trend({ ...query, serverId: 'NA1' })).points).toEqual([])
    expect((await controller.trend({ ...query, puuid: 'someone-else' })).points).toEqual([])
    expect((await controller.trend({ ...query, season: 1999 })).points).toEqual([])
    expect(profileTrendSchema.safeParse({ ...query, queue: 'RANKED_TFT' }).success).toBe(false)
  })
  it('paginates matches by account, champion and a half-open date range', async () => {
    for (const [serverId, puuid, gameId, startedAt, championId] of [
      ['EUW1', 'player', 1, 100, 103],
      ['EUW1', 'player', 2, 200, 103],
      ['EUW1', 'player', 3, 300, 103],
      ['EUW1', 'player', 4, 200, 222],
      ['NA1', 'player', 5, 200, 103],
      ['EUW1', 'other', 6, 200, 103]
    ] as const) {
      await source.query('INSERT INTO PoolMatches VALUES (?, ?, ?, ?, ?, ?)', [
        serverId,
        puuid,
        gameId,
        startedAt,
        JSON.stringify({ championId }),
        JSON.stringify(sgpSummary(gameId))
      ])
    }
    const query = profileMatchesSchema.parse({
      serverId: 'EUW1',
      puuid: 'player',
      championId: 103,
      from: 100,
      to: 300,
      pageSize: 1
    })
    const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
    registerProfileHandlers(
      {
        onCall: (
          _namespace: string,
          name: string,
          handler: (event: unknown, input: unknown) => unknown
        ) => handlers.set(name, handler)
      } as unknown as AkariIpcMain,
      controller
    )
    const matches = (input: unknown) => handlers.get('matches')!(null, input)
    expect(() => matches({ ...query, pageSize: 1000 })).toThrow()
    const first = (await matches(query)) as Awaited<ReturnType<ProfileController['matches']>>
    expect(first.total).toBe(2)
    expect(first.items.map((item) => item.gameId)).toEqual([2])
    expect(
      (await controller.matches({ ...query, page: 2 })).items.map((item) => item.gameId)
    ).toEqual([1])
    expect(
      (await controller.matches(profileMatchesSchema.parse({ serverId: 'EUW1', puuid: 'player' })))
        .total
    ).toBe(4)
    expect(profileMatchesSchema.safeParse({ ...query, from: 300 }).success).toBe(false)
    expect(profileMatchesSchema.safeParse({ ...query, pageSize: 1000 }).success).toBe(false)
  })
  it('reads recent activity for only the selected account and region with source-specific durations', async () => {
    const startedAt = Date.now() - 86_400_000
    const summary = sgpSummary()
    const projection = JSON.stringify({ startedAt, outcome: 'win' })
    for (const [serverId, puuid, gameId, game] of [
      ['EUW1', 'player', 1, summary],
      ['EUW1', 'player', 2, { source: 'lcu', data: { gameDuration: 1800 } }],
      ['NA1', 'player', 3, summary],
      ['EUW1', 'someone-else', 4, summary]
    ] as const) {
      await source.query('INSERT INTO PoolMatches VALUES (?, ?, ?, ?, ?, ?)', [
        serverId,
        puuid,
        gameId,
        startedAt,
        projection,
        JSON.stringify(game)
      ])
    }
    expect((await controller.activity({ serverId: 'EUW1', puuid: 'player' })).month).toMatchObject({
      games: 2,
      activeDays: 1,
      wins: 2,
      durationSeconds: 3000,
      durationSamples: 2
    })
    expect((await controller.activity({ serverId: 'EUW1', puuid: 'missing' })).month.games).toBe(0)
  })
})
