<template>
  <NCard
    size="small"
    :title="t('title')"
    :style="{ background: 'var(--pool-surface)', borderColor: 'var(--pool-border)' }"
  >
    <template #header-extra><RefreshButton :disabled="hydrating" @click="load" /></template>

    <div
      v-if="result?.missingTimelineGameIds?.length"
      class="mb-3 flex flex-wrap items-center gap-3"
    >
      <span class="text-xs opacity-70">{{
        poolT('timelineCoverage', { count: result.missingTimelineGameIds.length })
      }}</span>
      <NButton v-if="!hydrating" size="tiny" :disabled="!connected" @click="hydrate">{{
        poolT('fillTimelines')
      }}</NButton>
      <template v-else
        ><span class="text-xs">{{
          poolT('timelineProgress', { count: completed, total: batchSize })
        }}</span
        ><NButton size="tiny" @click="stopHydration">{{ poolT('stop') }}</NButton></template
      >
      <span v-if="!connected" class="text-xs opacity-60">{{ poolT('disconnected') }}</span>
    </div>
    <NAlert v-if="hydrationFailed" class="mb-3" type="warning">{{
      poolT('detailsUnavailable')
    }}</NAlert>
    <NSpin :show="loading && !result">
      <div class="flex flex-col gap-3">
        <NAlert v-if="result?.truncated" type="warning">{{ poolT('truncated') }}</NAlert>
        <span v-if="result?.excluded" class="text-xs opacity-60">{{
          t('excluded', { count: result.excluded })
        }}</span>
        <NEmpty v-if="result && !result.items.length" :description="t('empty')" />
        <NScrollbar v-else x-scrollable style="max-height: 330px">
          <NTable size="small" :single-line="false">
            <thead>
              <tr>
                <th>{{ t('opponent') }}</th>
                <th>
                  <NButton text size="tiny" @click="sortRows('games')"
                    >{{ poolT('games') }}
                    {{ sortKey === 'games' ? (ascending ? '↑' : '↓') : '↕' }}</NButton
                  >
                </th>
                <th>
                  <NButton text size="tiny" @click="sortRows('winRate')"
                    >{{ poolT('winRate') }} ↕︎</NButton
                  >
                </th>
                <th>
                  <NButton text size="tiny" @click="sortRows('goldDiff10')"
                    >{{ t('gold10') }} ↕︎</NButton
                  >
                </th>
                <th>
                  <NButton text size="tiny" @click="sortRows('csDiff10')"
                    >{{ t('cs10') }} ↕︎</NButton
                  >
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sortedItems" :key="row.opponentId">
                <td>
                  <NButton
                    text
                    :type="opponentId === row.opponentId ? 'primary' : 'default'"
                    @click="opponentId = row.opponentId"
                  >
                    <ChampionIcon :champion-id="row.opponentId" class="mr-2 size-10! rounded" />{{
                      resources.champions.name(row.opponentId)
                    }}
                  </NButton>
                </td>
                <td>{{ row.games }}</td>
                <td><MatchupMetric :metric="row.winRate" ratio /></td>
                <td><MatchupMetric :metric="row.goldDiff10" :scale="goldScale" /></td>
                <td><MatchupMetric :metric="row.csDiff10" :scale="csScale" /></td>
              </tr>
            </tbody>
          </NTable>
        </NScrollbar>
        <template v-if="opponentId">
          <MatchupBrief
            v-if="query.championId"
            :champion-id="query.championId"
            :opponent-id="opponentId"
          />
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <ChampionIcon :champion-id="query.championId ?? -1" class="size-10! rounded" /><NIcon
                :component="Bolt"
                :size="20"
                aria-hidden="true"
              /><ChampionIcon :champion-id="opponentId" class="size-10! rounded" /><span
                class="font-bold"
                >{{ t('against', { name: resources.champions.name(opponentId) }) }}</span
              >
            </div>
            <NButton
              size="small"
              @click="
                router.push({
                  name: NOTEBOOK_ROUTE,
                  query: { champion: query.championId, opponent: opponentId }
                })
              "
              >{{ t('notes') }}</NButton
            >
          </div>
          <div
            v-for="match in result?.matches"
            :key="match.gameId"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <span
              >{{ new Date(match.startedAt).toLocaleString() }} ·
              {{ t(`outcomes.${match.outcome}`) }}</span
            >
            <NButton
              size="tiny"
              @click="
                router.push({
                  name: REVIEW_ROUTE,
                  query: match.reportId
                    ? { id: match.reportId }
                    : { serverId: query.serverId, puuid: query.puuid, gameId: match.gameId }
                })
              "
              >{{ t('review') }}</NButton
            >
          </div>
          <NPagination
            v-if="result && result.matchCount > 10"
            v-model:page="page"
            :page-size="10"
            :item-count="result.matchCount"
            :disabled="loading"
          />
        </template>
      </div>
    </NSpin>
  </NCard>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import {
  computed,
  ref,
  shallowRef,
  watch,
  onMounted,
  onActivated,
  onDeactivated,
  onScopeDispose
} from 'vue'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { ReviewRenderer } from '../../../shared/shards/review'
import { Bolt } from '@vicons/tabler'
import { useRouter } from 'vue-router'
import {
  NIcon,
  NCard,
  NButton,
  NTable,
  NAlert,
  NEmpty,
  NScrollbar,
  NSpin,
  NPagination
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import type { PoolMatchQuery } from '@shared/pro/champion-pool'
import type { MatchupResult, MatchupStats } from '@shared/pro/champion-pool/matchups'
import { NOTEBOOK_ROUTE } from '@shared/pro/notebook'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import MatchupMetric from './MatchupMetric.vue'
import MatchupBrief from './MatchupBrief.vue'
const props = defineProps<{ query: PoolMatchQuery }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.matchups' })
const { t: poolT } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const api = useInstance(ChampionPoolRenderer),
  resources = useGameResourceProvider(),
  router = useRouter()
const result = shallowRef<MatchupResult | null>(null),
  opponentId = ref<number | null>(null),
  page = ref(1),
  loading = ref(false),
  error = ref(false)
const sortKey = ref<'games' | 'winRate' | 'goldDiff10' | 'csDiff10'>('games'),
  ascending = ref(false)
function sortRows(key: typeof sortKey.value) {
  ascending.value = sortKey.value === key ? !ascending.value : false
  sortKey.value = key
}
const sortedItems = computed(() =>
  (result.value?.items ?? []).toSorted((a, b) => {
    const value = (row: MatchupStats) =>
      sortKey.value === 'games' ? row.games : row[sortKey.value].value
    const av = value(a),
      bv = value(b)
    if (av === null) return bv === null ? a.opponentId - b.opponentId : 1
    if (bv === null) return -1
    return (ascending.value ? av - bv : bv - av) || a.opponentId - b.opponentId
  })
)
const goldScale = computed(() =>
  Math.max(1, ...(result.value?.items ?? []).map((row) => Math.abs(row.goldDiff10.value ?? 0)))
)
const csScale = computed(() =>
  Math.max(1, ...(result.value?.items ?? []).map((row) => Math.abs(row.csDiff10.value ?? 0)))
)
const review = useInstance(ReviewRenderer)
const league = useLeagueClientStore()
const connected = computed(() => league.isConnected)
const hydrating = ref(false),
  hydrationFailed = ref(false),
  completed = ref(0),
  batchSize = ref(0)
let hydrationGeneration = 0
function stopHydration() {
  hydrationGeneration++
  hydrating.value = false
}
async function hydrate() {
  if (hydrating.value || !connected.value || !active) return
  const ids = result.value?.missingTimelineGameIds.slice(0, 20) ?? []
  if (!ids.length) return
  const current = ++hydrationGeneration
  const player = { serverId: props.query.serverId, puuid: props.query.puuid }
  hydrating.value = true
  hydrationFailed.value = false
  completed.value = 0
  batchSize.value = ids.length
  try {
    for (const gameId of ids) {
      if (current !== hydrationGeneration || !active) return
      const report = await review.open({ ...player, gameId, refresh: true })
      if (current !== hydrationGeneration) return
      completed.value++
      const point = report.analysis.checkpoints.find((p) => p.target === 600000)?.point
      if (!point || point.goldDiff === null || point.csDiff === null) {
        hydrationFailed.value = true
        break
      }
    }
  } catch {
    if (current === hydrationGeneration) hydrationFailed.value = true
  } finally {
    if (current === hydrationGeneration) {
      hydrating.value = false
      await load()
    }
  }
}
let active = false,
  generation = 0
useQueryCache(
  () => JSON.stringify([props.query, opponentId.value, page.value]),
  result,
  () => null
)
async function load() {
  const current = ++generation
  if (!active) return
  loading.value = true
  error.value = false
  try {
    const next = await api.matchups({
      ...props.query,
      opponentId: opponentId.value,
      page: page.value,
      pageSize: 10
    })
    if (current === generation) result.value = next
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => props.query,
  (next, previous) => {
    if (JSON.stringify(next) === JSON.stringify(previous)) {
      void load()
      return
    }
    generation++
    stopHydration()
    hydrationFailed.value = false
    opponentId.value = null
    page.value = 1
    void load()
  },
  { deep: true }
)
watch(opponentId, () => {
  page.value = 1
})
watch([opponentId, page], () => {
  void load()
})
function activate() {
  if (!active) {
    active = true
    void load().then(() => {
      if (active) void hydrate()
    })
  }
}
function deactivate() {
  active = false
  stopHydration()
  generation++
  loading.value = false
}
onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onScopeDispose(deactivate)
useRefreshFeedback(
  () => error.value,
  () => t('failed')
)
</script>
