<template>
  <div class="profile-page flex h-full min-w-0 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="Person24Regular" size="22" />
      <span class="text-base font-bold">{{ t('title') }}</span>
      <NButton
        size="small"
        :loading="capturing"
        :disabled="!status?.current || capturing"
        @click="capture"
        >{{ t('capture') }}</NButton
      >
      <NButton size="small" @click="refresh">{{ t('refresh') }}</NButton>
    </div>
    <NScrollbar class="min-h-0 flex-1">
      <div class="flex flex-col gap-4 p-6">
        <NAlert v-if="error || status?.error" type="warning">{{ t('failed') }}</NAlert>
        <NSelect
          v-model:value="selected"
          :options="playerOptions"
          :placeholder="t('selectPlayer')"
          :aria-label="t('selectPlayer')"
        />
        <NCard v-if="latest" size="small">
          <div class="mb-4 flex items-center gap-4">
            <LcuImage
              :src="`/lol-game-data/assets/v1/profile-icons/${latest.summoner.profileIconId}.jpg`"
              class="size-16 rounded"
            />
            <div class="flex flex-col gap-1">
              <span class="text-lg font-bold">{{ displayName(latest) }}</span>
              <span class="text-xs opacity-60"
                >{{ latest.serverId }} ·
                {{ t('level', { level: latest.summoner.summonerLevel }) }}</span
              >
              <span class="text-xs opacity-60">{{
                t('observedAt', { time: new Date(latest.observedAt).toLocaleString() })
              }}</span>
            </div>
          </div>
          <RankedTable :ranked-stats="latest.ranked" />
        </NCard>
        <SessionAndPartners
          v-if="selectedPlayer"
          :player="selectedPlayer"
          :refresh-token="refreshToken"
        />
        <ProfileActivity
          v-if="selectedPlayer"
          :player="selectedPlayer"
          :refresh-token="refreshToken"
        />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="font-bold">{{ t('history') }}</span>
          <NRadioGroup v-model:value="queue" size="small">
            <NRadioButton
              v-for="option in queueOptions"
              :key="option.value"
              :value="option.value"
              >{{ option.label }}</NRadioButton
            >
          </NRadioGroup>
          <NSelect
            :value="
              availableSeasons.length
                ? seasonFilter === null
                  ? 'unknown'
                  : seasonFilter
                : undefined
            "
            :disabled="!availableSeasons.length"
            :options="seasonOptions"
            :aria-label="t('season')"
            :placeholder="t('season')"
            class="w-48!"
            @update:value="changeSeason"
          />
        </div>
        <NSpin :show="loading">
          <RankHistoryChart
            v-if="trend?.points.length"
            :trend="trend"
            :selected="selectedPoint"
            :rank-label="rankLabel"
            :change-label="changeLabel"
            @select="selectPoint"
          />
          <NEmpty v-else-if="!loading" :description="t('noSeasonRecords')" />
        </NSpin>
        <div class="flex justify-end">
          <NPagination
            v-model:page="page"
            :page-size="30"
            :item-count="trend?.points.length ?? 0"
            :disabled="loading"
          />
        </div>
        <NSpin :show="loading">
          <NTable size="small" :single-line="false">
            <thead>
              <tr>
                <th>{{ t('time') }}</th>
                <th>{{ t('season') }}</th>
                <th>{{ t('rank') }}</th>
                <th>LP</th>
                <th>{{ t('change') }}</th>
                <th>{{ t('winsLosses') }}</th>
                <th>{{ t('reason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="snapshot in history" :key="snapshot.id">
                <td>
                  <NButton
                    text
                    size="small"
                    :type="selectedPoint === snapshot.id ? 'primary' : 'default'"
                    @click="selectPoint(snapshot.id)"
                    >{{ new Date(snapshot.observedAt).toLocaleString() }}</NButton
                  >
                </td>
                <td>{{ trend?.season ?? t('unknownSeason') }}</td>
                <td>
                  {{ rankLabel(snapshot) }}
                  <NTag v-if="snapshot.isProvisional" size="small">{{ t('provisional') }}</NTag>
                </td>
                <td>{{ snapshot.leaguePoints }}</td>
                <td>{{ changeLabel(snapshot) }}</td>
                <td>{{ snapshot.wins }} / {{ snapshot.losses }}</td>
                <td>{{ t(`reasons.${snapshot.reason}`) }} · LCU</td>
              </tr>
            </tbody>
          </NTable>
          <NEmpty v-if="!players.length && !loading" class="mt-5" :description="t('empty')" />
        </NSpin>
      </div>
    </NScrollbar>
  </div>
</template>
<script setup lang="ts">
import LcuImage from '@renderer-shared/components/LcuImage.vue'
import RankedTable from '@renderer-shared/components/RankedTable.vue'
import { useInstance } from '@renderer-shared/shards'
import {
  rankedQueues,
  type ProfileSnapshot,
  type ProfileStatus,
  type ProfileTrend,
  type RankPoint
} from '@shared/pro/profile'
import { Person24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NPagination,
  NRadioGroup,
  NRadioButton,
  NScrollbar,
  NSelect,
  NSpin,
  NTable,
  NTag
} from 'naive-ui'
import { computed, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { ProfileRenderer } from '../../../shared/shards/profile'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import type { PoolPlayer } from '@shared/pro/champion-pool'
import { useChampionPoolResources } from '../champion-pool/useChampionPoolResources'
import RankHistoryChart from './RankHistoryChart.vue'
import ProfileActivity from './ProfileActivity.vue'
import SessionAndPartners from './SessionAndPartners.vue'
import { z } from 'zod'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'
import { previousRankPoint } from './rank-history'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const { t: commonT } = useTranslation('common')
useChampionPoolResources()
const api = useInstance(ProfileRenderer)
const poolApi = useInstance(ChampionPoolRenderer)
const cachedPlayers = shallowRef<PoolPlayer[]>([])
const players = shallowRef<ProfileSnapshot[]>([])
const status = shallowRef<ProfileStatus | null>(null)
const selected = ref<string | null>(null)
const queue = ref<(typeof rankedQueues)[number]>('RANKED_SOLO_5x5')
const page = ref(1)
const trend = shallowRef<ProfileTrend | null>(null)
const seasonFilter = ref<number | null | undefined>(undefined)
const availableSeasons = ref<(number | null)[]>([])
const selectedPoint = ref<string | null>(null)
const refreshToken = ref(0)
const history = computed(() =>
  [...(trend.value?.points ?? [])].reverse().slice((page.value - 1) * 30, page.value * 30)
)
const pointIndexes = computed(
  () => new Map(trend.value?.points.map((point, index) => [point.id, index]) ?? [])
)
const seasonOptions = computed(() =>
  availableSeasons.value.map((season) => ({
    value: season ?? 'unknown',
    label: season === null ? t('unknownSeason') : String(season)
  }))
)
const loading = ref(false)
const capturing = ref(false)
const error = ref(false)
const key = (player: { serverId: string; puuid: string }) =>
  JSON.stringify([player.serverId, player.puuid])
const displayName = (snapshot: ProfileSnapshot) =>
  snapshot.summoner.gameName
    ? `${snapshot.summoner.gameName}#${snapshot.summoner.tagLine}`
    : snapshot.summoner.displayName
const latest = computed(() => players.value.find((p) => key(p) === selected.value))
const selectedPlayer = computed(
  () => latest.value ?? cachedPlayers.value.find((p) => key(p) === selected.value)
)
const playerOptions = computed(() => [
  ...new Map([
    ...cachedPlayers.value.map(
      (p) => [key(p), { label: `${p.name} · ${p.serverId}`, value: key(p) }] as const
    ),
    ...players.value.map(
      (p) => [key(p), { label: `${displayName(p)} · ${p.serverId}`, value: key(p) }] as const
    )
  ]).values()
])
const queueOptions = computed(() =>
  rankedQueues.map((value) => ({
    value,
    label: commonT(`queueTypes.${value}`, { defaultValue: value })
  }))
)
function rankLabel(rank: Pick<RankPoint, 'tier' | 'division'>) {
  if (!rank.tier || ['NONE', 'NA'].includes(rank.tier)) return t('unranked')
  const division =
    ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) || rank.division === 'NA'
      ? ''
      : rank.division
  return `${commonT(`tiers.${rank.tier}`, { defaultValue: rank.tier })} ${division}`.trim()
}
function changeLabel(point: RankPoint) {
  const current = trend.value
  if (!current) return '—'
  const previous = previousRankPoint(
    current.points,
    pointIndexes.value.get(point.id) ?? -1,
    current.season
  )
  if (!previous) return '—'
  const delta = point.leaguePoints - previous.leaguePoints
  const change = `${previous.leaguePoints} → ${point.leaguePoints} LP (${delta > 0 ? '+' : ''}${delta})`
  return rankLabel(previous) === rankLabel(point)
    ? change
    : `${rankLabel(previous)} → ${rankLabel(point)} · ${change}`
}
function selectPoint(id: string) {
  selectedPoint.value = id
  const index = pointIndexes.value.get(id)
  if (index !== undefined)
    page.value = Math.floor(((trend.value?.points.length ?? 0) - 1 - index) / 30) + 1
}
function changeSeason(value: number | string) {
  seasonFilter.value = value === 'unknown' ? null : Number(value)
  page.value = 1
  selectedPoint.value = null
  void loadHistory()
}
let generation = 0
let reloadGeneration = 0
let active = false
let timer: ReturnType<typeof setInterval> | null = null
async function loadHistory() {
  if (!active) return
  const current = ++generation
  const player = selectedPlayer.value
  if (!player) {
    trend.value = null
    loading.value = false
    return
  }
  loading.value = true
  try {
    const next = await api.trend({
      serverId: player.serverId,
      puuid: player.puuid,
      queue: queue.value,
      season: seasonFilter.value
    })
    if (current === generation) {
      trend.value = next
      availableSeasons.value = next.seasons
      seasonFilter.value = next.seasons.length ? next.season : undefined
      if (!next.points.some((point) => point.id === selectedPoint.value))
        selectedPoint.value = next.points.at(-1)?.id ?? null
      page.value = Math.min(page.value, Math.max(1, Math.ceil(next.points.length / 30)))
      error.value = false
    }
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
function refresh() {
  refreshToken.value++
  void reload(true)
}
async function reload(force = false) {
  if (!active) return
  const current = ++reloadGeneration
  try {
    const [nextStatus, nextPlayers, cached] = await Promise.all([
      api.status(),
      api.players(),
      poolApi.players()
    ])
    if (current !== reloadGeneration) return
    status.value = nextStatus
    const changed =
      JSON.stringify(nextPlayers.map((p) => p.id)) !==
      JSON.stringify(players.value.map((p) => p.id))
    players.value = nextPlayers
    cachedPlayers.value = cached
    error.value = false
    if (!selected.value)
      selected.value =
        nextStatus.current &&
        [...nextPlayers, ...cached].some((p) => key(p) === key(nextStatus.current!))
          ? key(nextStatus.current)
          : nextPlayers[0]
            ? key(nextPlayers[0])
            : cached[0]
              ? key(cached[0])
              : null
    if (force || changed || !trend.value) await loadHistory()
  } catch {
    if (current === reloadGeneration) error.value = true
  }
}
async function capture() {
  capturing.value = true
  try {
    const next = await api.capture()
    if (active) {
      selected.value = key(next)
      page.value = 1
      await reload()
    }
  } catch {
    if (active) error.value = true
  } finally {
    capturing.value = false
  }
}
watch(
  [selected, queue],
  () => {
    trend.value = null
    page.value = 1
    seasonFilter.value = undefined
    availableSeasons.value = []
    selectedPoint.value = null
    void loadHistory()
  },
  { flush: 'sync' }
)
onActivated(() => {
  active = true
  void reload()
  timer = setInterval(reload, 10_000)
})
onDeactivated(() => {
  active = false
  generation++
  reloadGeneration++
  if (timer) clearInterval(timer)
  timer = null
})
useWorkspaceState(
  'pro-profile',
  { selected, queue, page, seasonFilter, selectedPoint },
  z.object({
    selected: z.string().nullable(),
    queue: z.enum(rankedQueues),
    page: z.number().int().positive(),
    seasonFilter: z.number().int().nullable().optional(),
    selectedPoint: z.string().nullable()
  })
)
</script>
