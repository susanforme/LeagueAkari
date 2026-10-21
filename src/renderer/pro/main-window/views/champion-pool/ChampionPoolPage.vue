<template>
  <div class="pool-page flex h-full min-w-0 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="PeopleTeam24Regular" size="22" />
      <span class="mr-2 text-base font-bold">{{ t('title') }}</span>
      <div class="flex-1" />
      <ShareCard
        v-if="result"
        :title="t('title')"
        :lines="shareLines"
        :identity="player?.name"
        :champions="result.items"
      />
      <RefreshButton :disabled="loading" @click="(refresh(), reloadResources())" />
    </div>
    <NScrollbar class="flex-1">
      <div class="flex flex-col gap-4 px-6 py-4">
        <NAlert v-if="status && status.storage !== 'ready'" type="error" :show-icon="true">
          {{ t(status.storage === 'newer-version' ? 'newerVersion' : 'unavailable') }}
        </NAlert>

        <div class="flex flex-wrap items-center gap-2">
          <NSelect
            v-model:value="queues"
            multiple
            clearable
            filterable
            class="w-60!"
            size="small"
            :options="queueOptions"
            :placeholder="t('allQueues')"
            :aria-label="t('queues')"
          />
          <NSelect
            v-model:value="position"
            clearable
            class="w-32!"
            size="small"
            :options="positionOptions"
            :placeholder="t('allPositions')"
            :aria-label="t('position')"
          />
          <NDatePicker
            v-model:value="dates"
            type="daterange"
            clearable
            size="small"
            :shortcuts="dateShortcuts"
            :aria-label="t('dateRange')"
            class="w-64!"
          />
          <NInput
            v-model:value="patch"
            clearable
            class="w-24!"
            size="small"
            :placeholder="t('patch')"
            :aria-label="t('patch')"
            :maxlength="20"
          />
          <NSelect
            v-model:value="championId"
            clearable
            filterable
            class="w-40!"
            size="small"
            :options="championOptions"
            :render-label="renderChampionLabel"
            :filter="filterChampion"
            :placeholder="t('allChampions')"
            :aria-label="t('champion')"
          />
          <NButton size="small" quaternary @click="reset">{{ t('reset') }}</NButton>
        </div>
        <NAlert v-if="result?.truncated" type="warning">{{ t('truncated') }}</NAlert>
        <NEmpty v-if="!player" :description="t('noPlayers')" class="my-16" />
        <template v-else-if="championId">
          <NSpin :show="loading && !result">
            <ChampionDetail
              v-if="detail"
              :champion="detail"
              :player="player"
              :matches="matches"
              :query="detailQuery"
              :loading="loading && !result"
              v-model:page="matchPage"
              v-model:page-size="matchPageSize"
              @back="championId = null"
              @history="openHistory"
              @navigate="openPlayer"
            />
            <div v-else class="flex flex-col items-center gap-3 py-12">
              <NEmpty :description="t('empty')" />
              <NButton size="small" @click="championId = null">{{ t('back') }}</NButton>
            </div>
          </NSpin>
        </template>
        <template v-else>
          <PoolOverview
            v-if="result"
            :result="result"
            @select="championId = $event"
            @position="position = $event"
            @day="dates = [$event, $event]"
          />
          <ChampionPoolTable
            :items="result?.items ?? []"
            :loading="loading && !result"
            :sort="sort"
            :sort-direction="sortDirection"
            @sort="
              (field, direction) => {
                sort = field
                sortDirection = direction
              }
            "
            @select="championId = $event"
          />
          <NPagination
            v-if="result && result.totalChampions > 20"
            v-model:page="page"
            :item-count="result.totalChampions"
            :page-size="20"
            class="self-end"
          />
        </template>
      </div>
    </NScrollbar>
  </div>
</template>

<script setup lang="ts">
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { positions, poolSortFields } from '@shared/pro/champion-pool'
import { PeopleTeam24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NDatePicker,
  NEmpty,
  NIcon,
  NInput,
  NPagination,
  NScrollbar,
  NSelect,
  NSpin,
  type SelectOption
} from 'naive-ui'
import { computed, h, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { z } from 'zod'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'
import ShareCard from '../../../shared/components/share-card/ShareCard.vue'

import ChampionDetail from './ChampionDetail.vue'
import ChampionPoolTable from './ChampionPoolTable.vue'
import PoolOverview from './PoolOverview.vue'
import { useChampionPool } from './useChampionPool'
import { useChampionPoolResources } from './useChampionPoolResources'

const { t } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const { t: common } = useTranslation('common')
const {
  resources,
  catalog,
  unavailable: resourcesUnavailable,
  reload: reloadResources
} = useChampionPoolResources()
const league = useLeagueClientStore()
const router = useRouter()
const {
  detailQuery,
  playerTabs,
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
  refresh
} = useChampionPool()
useWorkspaceState(
  'pro-champion-pool',
  {
    selected,
    queues,
    position,
    patch,
    dates,
    championId,
    sort,
    sortDirection,
    page,
    matchPage,
    matchPageSize
  },
  z.object({
    selected: z.string().nullable(),
    queues: z.array(z.number().int().positive()).max(32),
    position: z.enum(positions).nullable(),
    patch: z.string().max(20),
    dates: z.tuple([z.number(), z.number()]).nullable(),
    championId: z.number().int().positive().nullable(),
    sort: z.enum(poolSortFields),
    sortDirection: z.enum(['asc', 'desc']),
    page: z.number().int().positive(),
    matchPage: z.number().int().positive(),
    matchPageSize: z.number().int().min(1).max(100)
  })
)
const route = useRoute()
function routeChampion() {
  if (route.name !== 'pro-champion-pool' || !route.query.champion) return
  if (typeof route.query.queues === 'string') {
    const parsed = z
      .array(z.number().int().positive())
      .min(1)
      .max(32)
      .safeParse(route.query.queues.split(',').map(Number))
    if (parsed.success) {
      reset()
      queues.value = parsed.data
    }
    void router.replace({ query: { ...route.query, queues: undefined } })
  }
  const id = Number(route.query.champion)
  if (Number.isSafeInteger(id) && id > 0) championId.value = id
}
watch([() => route.query.champion, () => route.query.queues], routeChampion, {
  immediate: true,
  flush: 'sync'
})
watch(
  championId,
  (value) => {
    if (
      route.name !== 'pro-champion-pool' ||
      route.query.champion === undefined ||
      String(value) === route.query.champion
    )
      return
    void router.replace({
      query: { ...route.query, champion: value === null ? undefined : String(value) }
    })
  },
  { flush: 'post' }
)
const shareLines = computed(() => [
  `${t('games')}: ${result.value?.filteredMatches ?? 0}`,
  queues.value.length
    ? queues.value.map((id) => resources.queues.name(id)).join(' · ')
    : t('allQueues'),
  ...[
    patch.value,
    position.value
      ? position.value === 'UNKNOWN'
        ? t('unknownPosition')
        : common(`positions.${position.value}`)
      : ''
  ].filter(Boolean)
])
const queueOptions = computed(() =>
  [
    ...new Set([
      420,
      440,
      430,
      400,
      450,
      2400,
      480,
      490,
      900,
      1900,
      1710,
      2300,
      ...queues.value,
      ...Object.keys(league.gameData.queues).map(Number)
    ])
  ]
    .filter((id) => id > 0)
    .map((id) => ({ value: id, label: resources.queues.name(id) }))
)
const positionOptions = computed(() =>
  positions.map((p) => ({
    value: p,
    label: p === 'UNKNOWN' ? t('unknownPosition') : common(`positions.${p}`)
  }))
)
const championOptions = computed(() =>
  [
    ...new Set([
      ...Object.keys(league.gameData.champions).map(Number),
      ...Object.keys(catalog.value.champions).map(Number),
      ...(result.value?.championIds ?? []),
      ...(championId.value ? [championId.value] : [])
    ])
  ]
    .filter((id) => id > 0)
    .map((id) => ({ value: id, label: resources.champions.name(id) }))
)
function renderChampionLabel(option: SelectOption) {
  return h('div', { class: 'flex items-center gap-2' }, [
    h(ChampionIcon, { championId: Number(option.value), style: 'width:24px;height:24px' }),
    String(option.label)
  ])
}
function filterChampion(pattern: string, option: SelectOption) {
  const id = Number(option.value)
  const champion = league.gameData.champions[id] ?? catalog.value.champions[id]
  return [option.label, champion?.name, champion?.alias].some((value) =>
    String(value ?? '')
      .toLocaleLowerCase()
      .includes(pattern.toLocaleLowerCase().trim())
  )
}
const dateShortcuts = computed(() =>
  Object.fromEntries(
    [30, 90].map((days) => [
      t(`last${days}`),
      () => {
        const end = new Date()
        end.setHours(0, 0, 0, 0)
        const start = new Date(end)
        start.setDate(start.getDate() - days + 1)
        return [start.getTime(), end.getTime()] as [number, number]
      }
    ])
  )
)
const detail = computed(() => result.value?.items.find((c) => c.championId === championId.value))
async function openPlayer(puuid: string) {
  if (!player.value) return
  playerTabs.createTabAndSetCurrent(puuid, player.value.serverId)
  await router.push({ name: 'player-tabs', params: { sgpServerId: player.value.serverId, puuid } })
}
async function openHistory() {
  if (!player.value || !championId.value) return
  playerTabs.createTabAndSetCurrent(player.value.puuid, player.value.serverId, {
    matchHistory: {
      collectByChampionId: championId.value,
      ...(position.value && position.value !== 'UNKNOWN'
        ? { collectByPosition: position.value }
        : {})
    }
  })
  await router.push({
    name: 'player-tabs',
    params: { sgpServerId: player.value.serverId, puuid: player.value.puuid }
  })
}
useRefreshFeedback(
  () => error.value || status.value?.sync.error,
  () => t(error.value || status.value?.sync.error || 'loadFailed')
)
useRefreshFeedback(
  () => resourcesUnavailable.value,
  () => t('resourcesUnavailable')
)
</script>

<style scoped>
.pool-page {
  color: var(--la-color-text-primary);
  --pool-surface: color-mix(in srgb, var(--la-card-surface-95), white 55%);
  --pool-border: rgb(var(--la-card-border-rgb) / 0.09);
}
[data-theme='dark'] .pool-page {
  --pool-surface: color-mix(in srgb, var(--la-card-surface-95), white 4%);
}
</style>
