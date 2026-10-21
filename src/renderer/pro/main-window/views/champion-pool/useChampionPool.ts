import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import {
  type PoolMatchPage,
  type PoolPlayer,
  type PoolResult,
  type PoolStatus,
  querySchema
} from '@shared/pro/champion-pool'
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { PlayerTabsRenderer } from '@main-window/shards/player-tabs'

import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'

export function useChampionPool() {
  const api = useInstance(ChampionPoolRenderer)
  const playerTabs = useInstance(PlayerTabsRenderer)
  const league = useLeagueClientStore()
  const sgp = useSgpStore()
  const players = shallowRef<PoolPlayer[]>([])
  const selected = ref<string | null>(null)
  const identity = (p: { serverId: string; puuid: string }) => JSON.stringify([p.serverId, p.puuid])
  const player = computed(() => players.value.find((p) => identity(p) === selected.value))
  const status = shallowRef<PoolStatus | null>(null)
  const result = shallowRef<PoolResult | null>(null)
  const matches = shallowRef<PoolMatchPage | null>(null)
  const matchPage = ref(1)
  const matchPageSize = ref(20)
  const loading = ref(false)
  const error = ref('')
  const queues = ref<number[]>([420])
  const position = ref<ReturnType<typeof querySchema.parse>['position']>(null)
  const patch = ref('')
  const dates = ref<[number, number] | null>(null)
  const championId = ref<number | null>(null)
  const sort = ref<ReturnType<typeof querySchema.parse>['sort']>('games')
  const sortDirection = ref<ReturnType<typeof querySchema.parse>['sortDirection']>('desc')
  const page = ref(1)
  const active = ref(false)
  const cache = new Map<string, { result: PoolResult; matches: PoolMatchPage | null }>()
  let generation = 0
  let lifecycle = 0
  let polling = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined

  const query = computed(() => {
    if (!player.value) return null
    const end = dates.value ? new Date(dates.value[1]) : null
    end?.setHours(23, 59, 59, 999)
    return querySchema.safeParse({
      serverId: player.value.serverId,
      puuid: player.value.puuid,
      queueIds: queues.value,
      position: position.value,
      patch: patch.value || null,
      from: dates.value?.[0] ?? null,
      to: end?.getTime() ?? null,
      championId: championId.value,
      sort: sort.value,
      sortDirection: sortDirection.value,
      page: page.value,
      pageSize: 20
    })
  })

  const detailQuery = computed(() =>
    query.value?.success && query.value.data.championId
      ? { ...query.value.data, championId: query.value.data.championId }
      : null
  )

  const queryKey = computed(() =>
    JSON.stringify([query.value, matchPage.value, matchPageSize.value])
  )
  async function load() {
    const request = ++generation
    const key = queryKey.value
    loading.value = false
    if (!active.value || status.value?.storage !== 'ready' || !query.value) return
    if (!query.value.success) {
      error.value = 'invalidFilter'
      loading.value = false
      return
    }
    loading.value = !result.value
    error.value = ''
    try {
      const current = query.value.data
      const [next, history] = await Promise.all([
        api.query(current),
        current.championId === null
          ? null
          : api.matches({
              ...current,
              championId: current.championId,
              page: matchPage.value,
              pageSize: matchPageSize.value
            })
      ])
      if (request === generation) {
        result.value = next
        matches.value = history
        cache.delete(key)
        cache.set(key, { result: next, matches: history })
        if (cache.size > 20) cache.delete(cache.keys().next().value!)
      }
    } catch {
      if (request === generation) error.value = 'loadFailed'
    } finally {
      if (request === generation) loading.value = false
    }
  }

  async function refreshPlayers() {
    const epoch = lifecycle
    const cached = await api.players()
    if (!active.value || epoch !== lifecycle) return
    players.value = cached
    const current =
      league.summoner.me?.puuid && sgp.availability.sgpServerId
        ? identity({ puuid: league.summoner.me.puuid, serverId: sgp.availability.sgpServerId })
        : null
    selected.value =
      current ??
      (cached.some((p) => identity(p) === selected.value)
        ? selected.value
        : cached[0]
          ? identity(cached[0])
          : null)
  }

  async function poll() {
    clearTimeout(timer)
    if (!active.value || polling) return
    polling = true
    const epoch = lifecycle
    try {
      const wasRunning = status.value?.sync.running
      const next = await api.status()
      if (!active.value || epoch !== lifecycle) return
      status.value = next
      if (wasRunning && !status.value.sync.running) {
        await refreshPlayers()
        await load()
      }
    } catch {
      if (active.value && epoch === lifecycle) error.value = 'loadFailed'
    } finally {
      polling = false
      if (active.value) timer = setTimeout(poll, status.value?.sync.running ? 700 : 3000)
    }
  }

  async function refresh() {
    try {
      await poll()
      await refreshPlayers()
      await load()
    } catch {
      error.value = 'loadFailed'
    }
  }

  function reset() {
    queues.value = [420]
    position.value = null
    patch.value = ''
    dates.value = null
    championId.value = null
    sort.value = 'games'
    sortDirection.value = 'desc'
    page.value = 1
  }

  watch(
    [selected, queues, position, patch, dates, championId, sort, sortDirection],
    () => {
      generation++
      page.value = 1
      matchPage.value = 1
    },
    { flush: 'sync' }
  )
  watch(
    selected,
    (_, previous) => {
      result.value = null
      matches.value = null
      if (previous) championId.value = null
    },
    { flush: 'sync' }
  )
  watch(
    matchPageSize,
    () => {
      matchPage.value = 1
    },
    { flush: 'sync' }
  )
  watch(queryKey, () => {
    const previous = cache.get(queryKey.value)
    result.value = previous?.result ?? null
    matches.value = previous?.matches ?? null
    clearTimeout(debounce)
    generation++
    if (active.value) debounce = setTimeout(load, 160)
  })
  watch(
    () =>
      JSON.stringify([league.isConnected, league.summoner.me?.puuid, sgp.availability.sgpServerId]),
    () => {
      if (league.isConnected && league.summoner.me?.puuid && sgp.availability.sgpServerId)
        selected.value = identity({
          puuid: league.summoner.me.puuid,
          serverId: sgp.availability.sgpServerId
        })
      if (active.value) void refresh()
    },
    { flush: 'sync' }
  )
  api.onChanged(() => {
    if (active.value) void refresh()
  })
  onActivated(() => {
    active.value = true
    void refresh()
  })
  function deactivate() {
    active.value = false
    lifecycle++
    generation++
    loading.value = false
    clearTimeout(timer)
    clearTimeout(debounce)
  }
  onDeactivated(deactivate)
  onScopeDispose(deactivate)

  return {
    api,
    detailQuery,
    playerTabs,
    players,
    identity,
    player,
    selected,
    status,
    result,
    matches,
    matchPage,
    matchPageSize,
    loading,
    error,
    queues,
    position,
    patch,
    dates,
    championId,
    sort,
    sortDirection,
    page,
    reset,
    refresh,
    load
  }
}
