<template>
  <NCard size="small" :title="t('activity.title')">
    <template #header-extra>
      <NButton size="small" text @click="openHistory">{{ t('activity.openHistory') }}</NButton>
    </template>
    <NSpin :show="loading">
      <NAlert v-if="failed" type="warning">{{ t('failed') }}</NAlert>
      <template v-else-if="activity">
        <div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <NStatistic :label="t('activity.games')" :value="activity.month.games" />
          <NStatistic :label="t('activity.activeDays')" :value="activity.month.activeDays" />
          <NStatistic :label="t('activity.duration')" :value="duration(activity.month)" />
          <NStatistic :label="t('activity.winRate')" :value="winRate(activity.month)" />
        </div>
        <div class="mb-3 flex flex-wrap gap-4 text-xs opacity-70">
          <span>{{
            t('activity.results', { wins: activity.month.wins, losses: activity.month.losses })
          }}</span>
          <span>{{
            t('activity.unknownResults', {
              count: activity.month.games - activity.month.wins - activity.month.losses
            })
          }}</span>
          <span>{{
            t('activity.durationSamples', { count: activity.month.durationSamples })
          }}</span>
        </div>
        <ActivityHeatmap :days="activity.days" />
        <NAlert v-if="activity.truncated" type="warning" class="mt-3" :show-icon="false">
          {{ t('activity.truncated') }}
        </NAlert>
      </template>
      <NEmpty
        v-if="!loading && !failed && activity && !activity.month.games"
        class="mt-4"
        :description="t('activity.empty')"
      >
        <template #extra>
          <NButton size="small" @click="router.push({ name: CHAMPION_POOL_ROUTE })">
            {{ t('activity.openPool') }}
          </NButton>
        </template>
      </NEmpty>
    </NSpin>
  </NCard>
</template>
<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { CHAMPION_POOL_ROUTE, type PlayerIdentity } from '@shared/pro/champion-pool'
import type { ActivityPeriod, ProfileActivity } from '@shared/pro/profile'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NCard, NEmpty, NSpin, NStatistic } from 'naive-ui'
import { onActivated, onDeactivated, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import { ProfileRenderer } from '../../../shared/shards/profile'
import ActivityHeatmap from './ActivityHeatmap.vue'

const props = defineProps<{ player: PlayerIdentity; refreshToken: number }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const router = useRouter()
const api = useInstance(ProfileRenderer)
const pool = useInstance(ChampionPoolRenderer)
const activity = shallowRef<ProfileActivity | null>(null)
const loading = ref(false)
const failed = ref(false)
let active = false
let generation = 0
const rate = (period: ActivityPeriod) =>
  period.wins + period.losses ? (100 * period.wins) / (period.wins + period.losses) : null
const winRate = (period: ActivityPeriod) => {
  const value = rate(period)
  return value === null ? '—' : `${value.toFixed(1)}%`
}
const duration = (period: ActivityPeriod) =>
  period.durationSamples
    ? t('activity.hours', { value: (period.durationSeconds / 3600).toFixed(1) })
    : '—'
function openHistory() {
  void router.push({
    name: 'player-tabs',
    params: { sgpServerId: props.player.serverId, puuid: props.player.puuid }
  })
}
async function load() {
  if (!active) return
  const current = ++generation
  loading.value = true
  failed.value = false
  try {
    const next = await api.activity({ serverId: props.player.serverId, puuid: props.player.puuid })
    if (generation === current) activity.value = next
  } catch {
    if (generation === current) failed.value = true
  } finally {
    if (generation === current) loading.value = false
  }
}
watch(
  () => [props.player.serverId, props.player.puuid, props.refreshToken],
  () => {
    activity.value = null
    void load()
  },
  { flush: 'sync' }
)
pool.onChanged(() => {
  if (active) void load()
})
function activate() {
  if (active) return
  active = true
  void load()
}
function deactivate() {
  active = false
  generation++
}
onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onScopeDispose(deactivate)
</script>
