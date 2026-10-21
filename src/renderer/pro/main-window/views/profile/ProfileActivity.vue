<template>
  <section class="profile-panel activity-panel">
    <div class="activity-heading">
      <h2 class="profile-section-title">{{ t('activity.title') }}</h2>
      <NRadioGroup v-model:value="queue" size="small" :aria-label="t('dashboard.queue')">
        <NRadioButton :value="0">{{ t('rankedAll') }}</NRadioButton>
        <NRadioButton :value="420">{{ commonT('queueTypes.RANKED_SOLO_5x5') }}</NRadioButton>
        <NRadioButton :value="440">{{ commonT('queueTypes.RANKED_FLEX_SR') }}</NRadioButton>
      </NRadioGroup>
    </div>
    <NSpin :show="loading && !activity">
      <template v-if="activity">
        <div class="activity-grid">
          <div class="activity-metrics">
            <NButton
              v-for="metric in metrics"
              :key="metric.key"
              text
              class="metric"
              @click="$emit('period', activity.from, activity.to, queue)"
            >
              <div class="metric-content">
                <div class="metric-label profile-muted">
                  <NIcon :component="metric.icon" size="20" />{{ t(`activity.${metric.key}`) }}
                </div>
                <strong>{{ metric.value }}</strong
                ><span
                  class="metric-change"
                  :class="{
                    positive: metric.change !== null && metric.change > 0,
                    negative: metric.change !== null && metric.change < 0
                  }"
                  >{{
                    metric.change === null
                      ? t('dashboard.noBaseline')
                      : `${metric.change > 0 ? '+' : ''}${metric.change.toFixed(1)}${metric.key === 'winRate' ? ' pp' : '%'}`
                  }}</span
                ><span class="profile-muted metric-caption">{{ t('activity.change') }}</span>
              </div>
            </NButton>
          </div>
          <div class="activity-trend">
            <div class="profile-muted mb-3 text-xs">{{ t('dashboard.dailyWinRate') }}</div>
            <div class="h-28">
              <Line
                :data="winRateData"
                :options="winRateOptions"
                :aria-label="t('dashboard.dailyWinRate')"
              />
            </div>
          </div>
          <ActivityHeatmap v-if="activity.days.length" :days="activity.days" @select="selectDay" />
        </div>
        <div class="profile-muted mt-4 flex flex-wrap gap-4 text-xs">
          <span>{{
            t('activity.results', { wins: activity.month.wins, losses: activity.month.losses })
          }}</span
          ><span v-if="activity.month.games !== activity.month.wins + activity.month.losses">{{
            t('activity.unknownResults', {
              count: activity.month.games - activity.month.wins - activity.month.losses
            })
          }}</span
          ><span v-if="activity.month.durationSamples !== activity.month.games">{{
            t('activity.durationSamples', { count: activity.month.durationSamples })
          }}</span>
        </div>
        <NAlert v-if="activity.truncated" type="warning" class="mt-3" :show-icon="false">{{
          t('activity.truncated')
        }}</NAlert>
      </template>
      <NEmpty
        v-if="activity && !activity.month.games"
        class="mt-4"
        :description="t('activity.empty')"
        ><template #extra
          ><NButton size="small" @click="router.push({ name: CHAMPION_POOL_ROUTE })">{{
            t('activity.openPool')
          }}</NButton></template
        ></NEmpty
      >
    </NSpin>
  </section>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import { useInstance } from '@renderer-shared/shards'
import { CHAMPION_POOL_ROUTE, type PlayerIdentity } from '@shared/pro/champion-pool'
import type { ActivityPeriod, ProfileActivity } from '@shared/pro/profile'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NEmpty,
  NIcon,
  NSpin,
  NRadioGroup,
  NRadioButton,
  useThemeVars
} from 'naive-ui'
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useRouter } from 'vue-router'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import { ProfileRenderer } from '../../../shared/shards/profile'
import ActivityHeatmap from './ActivityHeatmap.vue'
import {
  Games24Regular,
  CalendarLtr24Regular,
  Clock24Regular,
  DataTrending24Regular
} from '@vicons/fluent'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { activityChanges } from './activity-comparison'
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip)

const emit = defineEmits<{ period: [from: number, to: number, queue: number] }>()
const queue = ref(0)
const { t: commonT } = useTranslation('common')
const theme = useThemeVars()
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
const metrics = computed(() => {
  const value = activity.value
  if (!value) return []
  const changes = activityChanges(value.recentWeek, value.previousWeek)
  return [
    { key: 'games', value: value.month.games, change: changes.games, icon: Games24Regular },
    {
      key: 'activeDays',
      value: value.month.activeDays,
      change: changes.activeDays,
      icon: CalendarLtr24Regular
    },
    {
      key: 'duration',
      value: duration(value.month),
      change: changes.duration,
      icon: Clock24Regular
    },
    {
      key: 'winRate',
      value: winRate(value.month),
      change: changes.winRate,
      icon: DataTrending24Regular
    }
  ]
})
const winRateData = computed(() => ({
  labels: activity.value?.days.map((day) => new Date(day.date).toLocaleDateString()) ?? [],
  datasets: [
    {
      label: t('activity.winRate'),
      data: activity.value?.days.map((day) => rate(day)) ?? [],
      borderColor: '#7794d5',
      pointBackgroundColor: '#7794d5',
      borderWidth: 1.5,
      pointRadius: 2,
      pointHitRadius: 10,
      spanGaps: false
    }
  ]
}))
const winRateOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  onClick: (_, elements) => {
    const day = activity.value?.days[elements[0]?.index]
    if (day) selectDay(day.date)
  },
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: { callbacks: { label: (item) => `${item.parsed.y?.toFixed(1)}%` } }
  },
  scales: {
    x: { display: false },
    y: {
      min: 0,
      max: 100,
      ticks: { maxTicksLimit: 3, color: theme.value.textColor3, callback: (value) => `${value}%` },
      grid: { color: theme.value.dividerColor }
    }
  }
}))
function selectDay(from: number) {
  const end = new Date(from)
  end.setDate(end.getDate() + 1)
  emit('period', from, end.getTime(), queue.value)
}
useQueryCache(
  () => JSON.stringify([props.player.serverId, props.player.puuid, queue.value]),
  activity,
  () => null
)
async function load() {
  if (!active) return
  const current = ++generation
  loading.value = true
  failed.value = false
  try {
    const next = await api.activity({
      serverId: props.player.serverId,
      puuid: props.player.puuid,
      queueIds: queue.value === 420 ? [420] : queue.value === 440 ? [440] : [420, 440]
    })
    if (generation === current) activity.value = next
  } catch {
    if (generation === current) failed.value = true
  } finally {
    if (generation === current) loading.value = false
  }
}
watch(
  [() => props.player.serverId, () => props.player.puuid],
  () => {
    void load()
  },
  { flush: 'sync' }
)
watch([() => props.refreshToken, queue], load)
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
useRefreshFeedback(
  () => failed.value,
  () => t('failed')
)
</script>

<style scoped>
.activity-panel {
  padding: 18px 20px;
}
.activity-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}
.activity-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(180px, 0.8fr) auto;
  gap: 26px;
  align-items: center;
}
.activity-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}
.metric {
  height: auto;
  text-align: left;
  justify-content: flex-start;
}
.metric :deep(.n-button__content) {
  display: block;
  width: 100%;
}
.metric-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}
.metric-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  white-space: normal;
}
.metric-content > strong {
  font-size: 27px;
  line-height: 1.5;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.metric-caption {
  font-size: 10px;
  white-space: normal;
}
.metric-change {
  font-size: 11px;
}
.positive {
  color: var(--profile-win);
}
.negative {
  color: var(--profile-loss);
}
.activity-trend {
  border-left: 1px solid var(--profile-border);
  padding-left: 20px;
}
@container (max-width: 1200px) {
  .activity-grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .activity-metrics {
    grid-column: 1 / -1;
  }
  .activity-trend {
    border-left: 0;
    padding-left: 0;
  }
}
@container (max-width: 560px) {
  .activity-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .activity-grid {
    grid-template-columns: 1fr;
  }
}
</style>
