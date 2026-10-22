<template>
  <div class="profile-page flex h-full min-w-0 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="Person24Regular" size="22" />
      <span class="text-base font-bold">{{ t('title') }}</span>
      <RefreshButton :disabled="loading" @click="refresh" />
    </div>
    <NScrollbar class="min-h-0 flex-1">
      <div class="flex flex-col gap-4 p-6">
        <section class="profile-identity profile-panel">
          <img :src="AkariLogo" class="identity-watermark" alt="" />
          <div class="identity-avatar">
            <LcuImage
              v-if="latest"
              :src="`/lol-game-data/assets/v1/profile-icons/${latest.summoner.profileIconId}.jpg`"
              class="size-16 rounded-lg"
              :alt="displayName(latest)"
            />
            <img v-else :src="AkariLogo" class="size-14" alt="" />
          </div>
          <div class="identity-copy">
            <span class="identity-name">{{
              latest
                ? displayName(latest)
                : localPlayers.find((p) => key(p) === selected)?.name || t('title')
            }}</span>
            <span class="profile-muted"
              >{{ selectedPlayer?.serverId
              }}<template v-if="latest">
                · {{ t('level', { level: latest.summoner.summonerLevel }) }}</template
              ></span
            >
          </div>
          <div class="identity-select">
            <span
              v-if="status?.current && selected === key(status.current)"
              class="connected-status"
              >{{ t('dashboard.connected') }}</span
            >
          </div>
        </section>
        <ProfileRanks
          v-if="selectedPlayer"
          :player="selectedPlayer"
          :snapshot="latest"
          :refresh-token="refreshToken"
          :rank-label="rankLabel"
          @history="openRankHistory"
        />
        <ProfilePerformance
          v-if="selectedPlayer"
          ref="performance"
          :player="selectedPlayer"
          :player-name="
            latest
              ? displayName(latest)
              : localPlayers.find((p) => key(p) === selected)?.name || selectedPlayer.puuid
          "
          :refresh-token="refreshToken"
        />
        <ProfileActivity
          v-if="selectedPlayer"
          :player="selectedPlayer"
          :refresh-token="refreshToken"
          @period="filterPeriod"
        />
        <NEmpty v-if="!selectedPlayer && !error" class="py-12" :description="t('empty')" />
        <section v-if="selectedPlayer" ref="historySection" class="profile-panel history-panel">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="profile-section-title">{{ t('history') }}</h2>
            <div class="flex flex-wrap items-center gap-3">
              <NRadioGroup v-model:value="queue" size="small">
                <NRadioButton
                  v-for="option in queueOptions"
                  :key="option.value"
                  :value="option.value"
                  >{{ option.label }}</NRadioButton
                >
              </NRadioGroup>
              <NSelect
                :value="seasonFilter ?? 'unknown'"
                :options="seasonOptions"
                :aria-label="t('season')"
                class="w-32!"
                size="small"
                @update:value="changeSeason"
              />
            </div>
          </div>
          <NSpin :show="loading && !trend">
            <RankHistoryChart
              v-if="trend?.points.length"
              :trend="trend"
              :selected="selectedPoint"
              :rank-label="rankLabel"
              @select="selectPoint"
            />
            <NEmpty v-else-if="!loading" :description="t('noSeasonRecords')" />
          </NSpin>
        </section>
        <section v-if="selectedPlayer" class="profile-panel history-panel">
          <SessionAndPartners :player="selectedPlayer" :refresh-token="refreshToken" />
        </section>
      </div>
    </NScrollbar>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import LcuImage from '@renderer-shared/components/LcuImage.vue'
import AkariLogo from '@renderer-shared/assets/logo/logo.svg'
import ProfileRanks from './ProfileRanks.vue'
import ProfilePerformance from './ProfilePerformance.vue'
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
  useNotification,
  NEmpty,
  NIcon,
  NRadioGroup,
  NRadioButton,
  NScrollbar,
  NSelect,
  NSpin
} from 'naive-ui'
import { computed, nextTick, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { ProfileRenderer } from '../../../shared/shards/profile'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import type { PoolPlayer } from '@shared/pro/champion-pool'
import { useChampionPoolResources } from '../champion-pool/useChampionPoolResources'
import RankHistoryChart from './RankHistoryChart.vue'
import ProfileActivity from './ProfileActivity.vue'
import SessionAndPartners from './SessionAndPartners.vue'
import { z } from 'zod'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const { t: commonT } = useTranslation('common')
useChampionPoolResources()
const notification = useNotification()
const league = useLeagueClientStore(),
  sgp = useSgpStore()
const api = useInstance(ProfileRenderer)
const poolApi = useInstance(ChampionPoolRenderer)
const localPlayers = shallowRef<PoolPlayer[]>([])
const players = shallowRef<ProfileSnapshot[]>([])
const status = shallowRef<ProfileStatus | null>(null)
const selected = ref<string | null>(null)
const queue = ref<(typeof rankedQueues)[number]>('RANKED_SOLO_5x5')
const trend = shallowRef<ProfileTrend | null>(null)
const seasonFilter = ref<number | null | undefined>(undefined)
const availableSeasons = ref<(number | null)[]>([])
const selectedPoint = ref<string | null>(null)
const refreshToken = ref(0)
const performance = ref<InstanceType<typeof ProfilePerformance>>()
const historySection = ref<HTMLElement>()
async function openRankHistory(value: (typeof rankedQueues)[number]) {
  queue.value = value
  await nextTick()
  historySection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function filterPeriod(from: number, to: number, queue: number) {
  performance.value?.filterPeriod(from, to, queue)
}
const seasonOptions = computed(() =>
  availableSeasons.value.map((season) => ({
    value: season ?? 'unknown',
    label: season === null ? t('unknownSeason') : String(season)
  }))
)
const loading = ref(false)
const error = ref(false)
const key = (player: { serverId: string; puuid: string }) =>
  JSON.stringify([player.serverId, player.puuid])
const displayName = (snapshot: ProfileSnapshot) =>
  snapshot.summoner.gameName
    ? `${snapshot.summoner.gameName}#${snapshot.summoner.tagLine}`
    : snapshot.summoner.displayName
const latest = computed(() => players.value.find((p) => key(p) === selected.value))
const selectedPlayer = computed(
  () => latest.value ?? localPlayers.value.find((p) => key(p) === selected.value)
)
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
function selectPoint(id: string) {
  selectedPoint.value = id
}
function changeSeason(value: number | string) {
  seasonFilter.value = value === 'unknown' ? null : Number(value)
  selectedPoint.value = null
  void loadHistory()
}
let generation = 0
let reloadGeneration = 0
let active = false
let timer: ReturnType<typeof setInterval> | null = null
useQueryCache(
  () => JSON.stringify([selected.value, queue.value, seasonFilter.value]),
  trend,
  () => null
)
async function loadHistory() {
  if (!active) return
  const current = ++generation
  const player = selectedPlayer.value
  if (!player) {
    trend.value = null
    loading.value = false
    return
  }
  loading.value = !trend.value
  try {
    const next = await api.trend({
      serverId: player.serverId,
      puuid: player.puuid,
      queue: queue.value,
      season: seasonFilter.value
    })
    if (current === generation) {
      availableSeasons.value = next.seasons
      seasonFilter.value = next.seasons.length ? next.season : undefined
      trend.value = next
      if (!next.points.some((point) => point.id === selectedPoint.value))
        selectedPoint.value = next.points.at(-1)?.id ?? null
      error.value = false
    }
  } catch {
    if (current === generation) notification.warning({ title: t('failed'), duration: 4000 })
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
    const [nextStatus, nextPlayers, local] = await Promise.all([
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
    localPlayers.value = local
    error.value = false
    if (nextStatus.current || !selected.value)
      selected.value = nextStatus.current
        ? key(nextStatus.current)
        : nextPlayers[0]
          ? key(nextPlayers[0])
          : local[0]
            ? key(local[0])
            : null
    if (changed) refreshToken.value++
    if (force || changed || !trend.value) await loadHistory()
  } catch {
    if (current === reloadGeneration) notification.warning({ title: t('failed'), duration: 4000 })
  }
}
watch(
  [selected, queue],
  () => {
    seasonFilter.value = undefined
    availableSeasons.value = []
    selectedPoint.value = null
    void loadHistory()
  },
  { flush: 'sync' }
)
watch(
  () =>
    JSON.stringify([league.isConnected, league.summoner.me?.puuid, sgp.availability.sgpServerId]),
  () => {
    if (league.isConnected && league.summoner.me?.puuid && sgp.availability.sgpServerId)
      selected.value = key({
        puuid: league.summoner.me.puuid,
        serverId: sgp.availability.sgpServerId
      })
    void reload()
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
  { selected, queue, seasonFilter, selectedPoint },
  z.object({
    selected: z.string().nullable(),
    queue: z.enum(rankedQueues),
    seasonFilter: z.number().int().nullable().optional(),
    selectedPoint: z.string().nullable()
  })
)
useRefreshFeedback(
  () => status.value?.error,
  () => t('failed')
)
</script>

<style scoped>
.profile-page {
  color: var(--la-color-text-primary);
  --profile-muted: color-mix(in srgb, var(--la-color-text-primary) 58%, transparent);
  --profile-border: rgb(var(--la-card-border-rgb) / 0.09);
  --profile-win: #16875c;
  --profile-loss: #d04455;
  container-type: inline-size;
}
[data-theme='dark'] .profile-page {
  --profile-win: #39cc96;
  --profile-loss: #ef7180;
}
.profile-page :deep(.profile-panel) {
  min-width: 0;
  border: 1px solid var(--profile-border);
  border-radius: 10px;
  background: var(--la-card-surface-90);
  overflow: hidden;
}
.profile-page :deep(.profile-muted) {
  color: var(--profile-muted);
}
.profile-page :deep(.profile-section-title) {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.profile-identity {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 16px 22px;
  min-height: 78px;
}
.identity-watermark {
  position: absolute;
  height: 210px;
  width: 210px;
  right: 29%;
  top: -48px;
  opacity: 0.045;
  pointer-events: none;
}
.identity-avatar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border: 1px solid var(--profile-border);
  border-radius: 10px;
  background: var(--la-card-muted-surface);
  overflow: hidden;
}
.identity-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 5px;
}
.identity-name {
  font-size: 23px;
  font-weight: 700;
  overflow-wrap: anywhere;
  line-height: 1.3;
}
.identity-select {
  width: 310px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.connected-status {
  color: var(--profile-win);
  text-align: right;
  font-size: 12px;
}
.history-panel {
  padding: 18px 20px;
  scroll-margin: 16px;
}
@container (max-width: 760px) {
  .profile-identity {
    flex-wrap: wrap;
    gap: 14px;
    padding: 18px;
  }
  .identity-select {
    width: 100%;
  }
  .identity-name {
    font-size: 20px;
  }
}
</style>
