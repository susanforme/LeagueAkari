import { type PoolMatch, querySchema } from '@shared/pro/champion-pool'
import { describe, expect, it } from 'vitest'

import { aggregatePool } from './aggregation'
import { selectHistorySource } from './match-history-loader'

const match = (overrides: Partial<PoolMatch> = {}): PoolMatch => ({
  gameId: 1,
  championId: 103,
  queueId: 420,
  position: 'MIDDLE',
  patch: '26.20',
  startedAt: 1000,
  outcome: 'win',
  kills: 10,
  deaths: 2,
  assists: 4,
  csPerMin: 6,
  damageShare: 0.2,
  ...overrides
})
const query = (overrides = {}) =>
  querySchema.parse({ serverId: 'EUW1', puuid: 'player', ...overrides })

describe('champion pool statistics', () => {
  it.each(['games', 'winRate', 'kda', 'csPerMin', 'damageShare'] as const)(
    'sorts %s in either direction before pagination, keeping missing values last',
    (sort) => {
      const matches = [
        match({
          championId: 1,
          kills: 1,
          deaths: 1,
          assists: 0,
          outcome: 'loss',
          csPerMin: 1,
          damageShare: 0.1
        }),
        match({ championId: 2 }),
        match({ gameId: 2, championId: 2 }),
        match({ championId: 3, kills: null, outcome: 'unknown', csPerMin: null, damageShare: null })
      ]
      const ids = (sortDirection: 'asc' | 'desc') =>
        [1, 2, 3].map(
          (page) =>
            aggregatePool(matches, query({ sort, sortDirection, page, pageSize: 1 }), 4).items[0]
              .championId
        )
      expect(ids('desc')).toEqual([2, 1, 3])
      expect(ids('asc')).toEqual(sort === 'games' ? [1, 3, 2] : [1, 2, 3])
    }
  )

  it('preserves per-match means and independent valid samples, excludes remakes', () => {
    const result = aggregatePool(
      [
        match(),
        match({
          gameId: 2,
          kills: 2,
          deaths: 0,
          assists: 0,
          outcome: 'loss',
          csPerMin: 8,
          damageShare: null
        }),
        match({
          gameId: 3,
          kills: 1,
          deaths: 1,
          assists: 0,
          outcome: 'unknown',
          csPerMin: null,
          damageShare: 0.4
        }),
        match({ gameId: 4, outcome: 'remake' })
      ],
      query(),
      4
    )
    expect(result.filteredMatches).toBe(3)
    const stats = result.items[0]
    expect(stats.winRate).toEqual({ value: 0.5, samples: 2, excluded: { unknownOutcome: 1 } })
    expect(stats.kda).toEqual({ value: 4, samples: 2, excluded: { zeroDenominator: 1 } })
    expect(stats.csPerMin).toEqual({ value: 7, samples: 2, excluded: { missing: 1 } })
    expect(stats.damageShare.value).toBeCloseTo(0.3)
    expect(stats.damageShare.samples).toBe(2)
  })

  it('filters before champion pagination and leaves missing metrics last', () => {
    const matches = [
      match({ gameId: 1, championId: 1, damageShare: null }),
      match({ gameId: 2, championId: 2, damageShare: 0.5 }),
      match({ gameId: 3, championId: 3, damageShare: 0.5 }),
      match({ gameId: 4, championId: 4, queueId: 450 }),
      match({ gameId: 5, championId: 2, position: 'TOP' })
    ]
    const filter = {
      sort: 'damageShare',
      position: 'MIDDLE',
      from: 1000,
      to: 1000,
      patch: '26.20',
      pageSize: 1
    }
    expect(aggregatePool(matches, query(filter), 5).items[0].championId).toBe(2)
    expect(aggregatePool(matches, query({ ...filter, page: 2 }), 5).items[0].championId).toBe(3)
    expect(aggregatePool(matches, query({ ...filter, page: 3 }), 5).items[0].championId).toBe(1)
    expect(aggregatePool(matches, query({ queueIds: [] }), 5).filteredMatches).toBe(5)
    expect(aggregatePool(matches, query({ queueIds: [450] }), 5).items[0].championId).toBe(4)
  })

  it('caps the statistics input window while reporting coverage', () => {
    const matches = Array.from({ length: 10_001 }, (_, index) =>
      match({ gameId: index + 1, startedAt: index + 1 })
    )
    const result = aggregatePool(matches, query(), matches.length)
    expect(result).toMatchObject({
      truncated: true,
      cachedMatches: 10_001,
      scannedMatches: 10_000,
      from: 2,
      to: 10_001
    })
  })

  it('rejects malformed filters at the IPC contract boundary', () => {
    expect(() => query({ from: 2000, to: 1000 })).toThrow()
    expect(() => query({ queueIds: [0] })).toThrow()
    expect(() => query({ pageSize: 100_000 })).toThrow()
    expect(() => query({ patch: 'anything' })).toThrow()
    expect(() => query({ sortDirection: 'invalid' })).toThrow()
  })
})

it('does not confuse absent SGP support, pending credentials, or a different server', () => {
  const options = {
    connected: true,
    currentServer: 'EUW1',
    targetServer: 'EUW1',
    preferredSource: 'sgp' as const,
    matchHistorySupported: true,
    tokenReady: true
  }
  expect(selectHistorySource(options)).toBe('sgp')
  expect(selectHistorySource({ ...options, matchHistorySupported: false })).toBe('lcu')
  expect(() => selectHistorySource({ ...options, tokenReady: false })).toThrow('waitingToken')
  expect(() => selectHistorySource({ ...options, targetServer: 'NA1' })).toThrow('differentServer')
  expect(() => selectHistorySource({ ...options, connected: false })).toThrow('disconnected')
})
