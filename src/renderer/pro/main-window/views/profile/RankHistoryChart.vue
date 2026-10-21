<template>
  <component
    :is="compact ? 'div' : NCard"
    size="small"
    :title="compact ? undefined : t('trendTitle')"
    :bordered="!compact"
    :class="{ 'compact-chart': compact }"
  >
    <div class="flex flex-col gap-3">
      <NRadioGroup v-if="!compact" v-model:value="metric" size="small">
        <NRadioButton value="rank">{{ t('rank') }}</NRadioButton>
        <NRadioButton value="lp">{{ t('leaguePoints') }}</NRadioButton>
      </NRadioGroup>
      <div :class="compact ? 'h-20' : 'h-72'">
        <Line
          v-if="hasRankedPoints"
          :data="data"
          :options="options"
          :aria-label="t('trendTitle')"
        />
        <NEmpty
          v-else
          :class="compact ? 'pt-5 text-xs' : 'pt-20'"
          :description="t('noRankedPoints')"
        />
      </div>
      <div v-if="!compact" class="text-xs opacity-60">{{ t('trendHelp') }}</div>
      <NAlert v-if="!compact && trend.season === null" type="info" :show-icon="false">{{
        t('unknownSeasonHelp')
      }}</NAlert>
      <div v-if="!compact && selectedPoint" class="flex flex-wrap gap-4 text-sm" aria-live="polite">
        <span>{{ new Date(selectedPoint.observedAt).toLocaleString() }}</span>
        <span
          >{{ rankLabel(selectedPoint)
          }}{{ selectedPoint.isProvisional ? ` · ${t('provisional')}` : '' }}</span
        >
        <span>{{ selectedPoint.leaguePoints }} LP</span>
        <span>{{ t('change') }}: {{ changeLabel(selectedPoint) }}</span>
      </div>
    </div>
  </component>
</template>
<script setup lang="ts">
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { ProfileTrend, RankPoint } from '@shared/pro/profile'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions
} from 'chart.js'
import { useTranslation } from 'i18next-vue'
import { NAlert, NCard, NEmpty, NRadioButton, NRadioGroup } from 'naive-ui'
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import { rankIndex, rankSteps } from './rank-history'
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)
const props = defineProps<{
  compact?: boolean
  color?: string
  trend: ProfileTrend
  selected: string | null
  rankLabel: (rank: Pick<RankPoint, 'tier' | 'division'>) => string
  changeLabel: (point: RankPoint) => string
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const resources = useGameResourceProvider()
const metric = ref<'rank' | 'lp'>(props.compact ? 'lp' : 'rank')
const selectedPoint = computed(() =>
  props.trend.points.find((point) => point.id === props.selected)
)
const rankValues = computed(() =>
  props.trend.points
    .filter((point) => !point.isProvisional)
    .flatMap((point) => {
      const rank = rankIndex(point)
      return rank === null ? [] : [rank]
    })
)
const hasRankedPoints = computed(() => rankValues.value.length > 0)
const data = computed(() => ({
  labels: props.trend.points.map((point) => new Date(point.observedAt).toLocaleString()),
  datasets: [
    {
      label: metric.value === 'rank' ? t('rank') : t('leaguePoints'),
      data: props.trend.points.map((point) =>
        point.isProvisional || rankIndex(point) === null
          ? null
          : metric.value === 'rank'
            ? rankIndex(point)
            : point.leaguePoints
      ),
      borderColor: props.color ?? '#5b9fe6',
      backgroundColor: props.color ?? '#5b9fe6',
      borderWidth: props.compact ? 1.5 : 2,
      pointRadius: props.trend.points.map((point) =>
        point.id === props.selected ? 5 : props.compact ? 2 : 3
      ),
      pointHitRadius: 8,
      tension: 0,
      spanGaps: false,
      showLine: props.trend.season !== null
    }
  ]
}))
const options = computed<ChartOptions<'line'>>(() => {
  const color = resources.runtime.colorMode === 'dark' ? '#bbb' : '#555'
  const grid = resources.runtime.colorMode === 'dark' ? '#ffffff15' : '#00000015'
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    onClick: (_, elements) => {
      const point = props.trend.points[elements[0]?.index]
      if (point) emit('select', point.id)
    },
    plugins: {
      datalabels: { display: false },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => {
            const point = props.trend.points[item.dataIndex]
            return [
              props.rankLabel(point),
              `${point.leaguePoints} LP`,
              `${t('change')}: ${props.changeLabel(point)}`
            ]
          }
        }
      }
    },
    scales: {
      x: {
        display: !props.compact,
        ticks: { color, maxTicksLimit: 6, maxRotation: 0 },
        grid: { color: grid },
        title: { display: true, text: t('recordOrder'), color }
      },
      y: {
        ticks: {
          color,
          maxTicksLimit: props.compact ? 3 : 8,
          ...(metric.value === 'rank'
            ? {
                stepSize: 1,
                callback: (value) => {
                  const rank = rankSteps[Number(value)]
                  return rank ? props.rankLabel(rank) : ''
                }
              }
            : {})
        },
        grid: { color: grid },
        ...(metric.value === 'rank'
          ? {
              min: Math.max(0, rankValues.value.reduce((a, b) => Math.min(a, b), 30) - 1),
              max: Math.min(30, rankValues.value.reduce((a, b) => Math.max(a, b), 0) + 1)
            }
          : {})
      }
    }
  }
})
</script>
