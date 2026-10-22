import type { PoolMatchPage, PoolResult } from '@shared/pro/champion-pool'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import { useChampionPool } from './useChampionPool'

const environment = vi.hoisted(() => ({
  activate: () => {},
  deactivate: () => {},
  api: { status: vi.fn(), players: vi.fn(), query: vi.fn(), matches: vi.fn(), onChanged: vi.fn() },
  tabs: { getSearchHistory: vi.fn() },
  league: { isConnected: false, summoner: { me: null as { puuid: string } | null } }
}))
vi.mock('vue', async (load) => ({
  ...(await load<typeof import('vue')>()),
  onActivated: (callback: () => void) => {
    environment.activate = callback
  },
  onDeactivated: (callback: () => void) => {
    environment.deactivate = callback
  }
}))
vi.mock('@renderer-shared/shards', () => ({
  useInstance: (type: { id: string }) => (type.id === 'pool' ? environment.api : environment.tabs)
}))
vi.mock('../../../shared/shards/champion-pool', () => ({ ChampionPoolRenderer: { id: 'pool' } }))
vi.mock('@main-window/shards/player-tabs', () => ({ PlayerTabsRenderer: { id: 'tabs' } }))
vi.mock('@main-window/shards/player-tabs/store', () => ({
  usePlayerTabsStore: () => ({ tabs: [], frontendSettings: { matchHistoryUseSgpApi: true } })
}))
vi.mock('@renderer-shared/shards/league-client/store', () => ({
  useLeagueClientStore: () => environment.league
}))
vi.mock('@renderer-shared/shards/sgp/store', () => ({
  useSgpStore: () => ({ availability: { sgpServerId: 'EUW1' } })
}))

let scope: ReturnType<typeof effectScope>
let pool: ReturnType<typeof useChampionPool>
const result = (localMatches: number) => ({ localMatches, items: [] }) as unknown as PoolResult
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  environment.league = reactive({ isConnected: false, summoner: { me: null } })
  environment.api.status.mockResolvedValue({ storage: 'ready', sync: { running: false } })
  environment.api.players.mockResolvedValue([
    { serverId: 'EUW1', puuid: 'one', name: 'One', updatedAt: 0 },
    { serverId: 'EUW1', puuid: 'two', name: 'Two', updatedAt: 0 }
  ])
  environment.tabs.getSearchHistory.mockResolvedValue([])
  environment.api.query.mockResolvedValue(result(1))
  environment.api.matches.mockResolvedValue({ items: [], total: 45 })
  scope = effectScope()
  pool = scope.run(useChampionPool)!
  environment.activate()
  await flush()
  await vi.advanceTimersByTimeAsync(160)
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

it('paginates champion history and ignores an old page after changing filters', async () => {
  pool.championId.value = 103
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  expect(environment.api.matches).toHaveBeenLastCalledWith(
    expect.objectContaining({
      championId: 103,
      page: 1,
      pageSize: 20
    })
  )
  let resolve!: (value: PoolMatchPage) => void
  environment.api.matches.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  pool.matchPage.value = 2
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  expect(environment.api.matches).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  pool.queues.value = [450]
  environment.api.matches.mockResolvedValue({ items: [], total: 3 })
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  resolve({ items: [], total: 999 })
  await flush()
  expect(pool.matchPage.value).toBe(1)
  expect(pool.matches.value?.total).toBe(3)
  expect(environment.api.matches).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, queueIds: [450] })
  )
  pool.matchPage.value = 2
  pool.matchPageSize.value = 50
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  expect(environment.api.matches).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, pageSize: 50 })
  )
})

it('does not let a previous player request overwrite a newly selected player', async () => {
  let resolve!: (value: PoolResult) => void
  environment.api.query.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const pending = pool.load()
  pool.selected.value = pool.identity(pool.players.value[1])
  await flush()
  environment.api.query.mockResolvedValue(result(2))
  await vi.advanceTimersByTimeAsync(160)
  resolve(result(99))
  await pending
  expect(pool.result.value?.localMatches).toBe(2)
  expect(pool.player.value?.puuid).toBe('two')
})

it('starts at the first page when changing the sort field or direction', async () => {
  pool.page.value = 2
  await flush()
  pool.sort.value = 'winRate'
  pool.sortDirection.value = 'asc'
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  expect(pool.page.value).toBe(1)
  expect(environment.api.query).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sort: 'winRate',
      sortDirection: 'asc',
      page: 1
    })
  )
  pool.page.value = 2
  pool.sortDirection.value = 'desc'
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  expect(environment.api.query).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sort: 'winRate',
      sortDirection: 'desc',
      page: 1
    })
  )
})

it('preserves filters across deactivation while stopping polling and ignoring pending results', async () => {
  pool.queues.value = [450]
  pool.patch.value = '26.20'
  await flush()
  await vi.advanceTimersByTimeAsync(160)
  let resolve!: (value: PoolResult) => void
  environment.api.query.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const pending = pool.load()
  environment.deactivate()
  const calls = environment.api.status.mock.calls.length
  resolve(result(99))
  await pending
  await vi.advanceTimersByTimeAsync(6000)
  expect(environment.api.status).toHaveBeenCalledTimes(calls)
  expect(pool.result.value?.localMatches).not.toBe(99)
  environment.activate()
  await flush()
  expect(pool.queues.value).toEqual([450])
  expect(pool.patch.value).toBe('26.20')
  expect(environment.api.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ queueIds: [450], patch: '26.20' })
  )
})

it('keeps cached content visible without loading on refresh failure', async () => {
  const cached = pool.result.value
  let reject!: (error: Error) => void
  environment.api.query.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  const pending = pool.load()
  expect(pool.result.value).toBe(cached)
  expect(pool.loading.value).toBe(false)
  reject(new Error('offline'))
  await pending
  expect(pool.result.value).toBe(cached)
  expect(pool.error.value).toBe('loadFailed')
})

it('hides the previous account immediately even when refreshing the player list fails', async () => {
  expect(pool.result.value).not.toBeNull()
  environment.api.players.mockRejectedValue(new Error('temporarily unavailable'))
  environment.league.summoner.me = { puuid: 'two' }
  environment.league.isConnected = true
  expect(pool.selected.value).toBe(JSON.stringify(['EUW1', 'two']))
  expect(pool.result.value).toBeNull()
  await flush()
  expect(pool.player.value?.puuid).toBe('two')
})
