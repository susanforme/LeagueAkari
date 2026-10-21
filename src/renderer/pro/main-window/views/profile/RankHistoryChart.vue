<template>
  <div class="flex flex-col gap-3">
    <div v-if="!compact" class="flex flex-wrap justify-end gap-3">
      <NSelect
        v-model:value="period"
        :options="periodOptions"
        :aria-label="t('interval')"
        class="w-32!"
        size="small"
      />
      <NRadioGroup v-model:value="mode" size="small" :aria-label="t('displayMode')">
        <NRadioButton value="trend">{{ t('trendMode') }}</NRadioButton>
        <NRadioButton value="range">{{ t('rangeMode') }}</NRadioButton>
      </NRadioGroup>
    </div>
    <div :class="compact ? 'h-20' : 'h-72'">
      <Line
        v-if="hasRankedPoints"
        :data="data"
        :options="options"
        :plugins="[ranges]"
        :aria-label="t('history')"
      />
      <NEmpty
        v-else
        :class="compact ? 'pt-5 text-xs' : 'pt-20'"
        :description="t('noRankedPoints')"
      />
    </div>
  </div>
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
  type ChartOptions,
  type Plugin
} from 'chart.js'
import { useTranslation } from 'i18next-vue'
import { NEmpty, NRadioButton, NRadioGroup, NSelect } from 'naive-ui'
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import { rankIndex, rankSteps, rankPeriods } from './rank-history'
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)
const props = defineProps<{
  compact?: boolean
  color?: string
  trend: ProfileTrend
  selected: string | null
  rankLabel: (rank: Pick<RankPoint, 'tier' | 'division'>) => string
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const resources = useGameResourceProvider()
const period = ref<'record' | 'day' | 'week' | 'month'>('day'),
  mode = ref('trend')
const periodOptions = computed(() =>
  ['record', 'day', 'week', 'month'].map((value) => ({ value, label: t(`intervals.${value}`) }))
)
const groups = computed(() =>
  rankPeriods(props.trend.points, props.compact ? 'record' : period.value)
)
const hasRankedPoints = computed(() => groups.value.some((g) => g.rank))
const colors = computed(() => [props.color ?? '#8d80db', '#2ba580'])
const data = computed(() => ({
  labels: groups.value.map((g) =>
    period.value === 'record'
      ? new Date(g.at).toLocaleString()
      : new Date(g.at).toLocaleDateString()
  ),
  datasets: ['rank', 'lp'].map((key, index) => ({
    label: t(key === 'rank' ? 'rank' : 'leaguePoints'),
    yAxisID: key,
    data: groups.value.map(({ point }) =>
      point.isProvisional || rankIndex(point) === null
        ? null
        : key === 'rank'
          ? rankIndex(point)
          : point.leaguePoints
    ),
    borderColor: colors.value[index],
    backgroundColor: colors.value[index],
    borderWidth: props.compact ? 1.5 : 2,
    pointRadius: groups.value.map((g) =>
      g.point.id === props.selected ? 5 : props.compact ? 1 : 3
    ),
    pointHitRadius: 8,
    tension: 0,
    spanGaps: false,
    showLine: props.trend.season !== null
  }))
}))
const ranges: Plugin<'line'> = {
  id: 'pro-rank-ranges',
  afterDatasetsDraw(chart) {
    if (props.compact || mode.value !== 'range') return
    const { ctx } = chart
    ctx.save()
    for (const [index, key] of (['rank', 'lp'] as const).entries()) {
      if (!chart.isDatasetVisible(index)) continue
      ctx.strokeStyle = colors.value[index]
      ctx.lineWidth = 2
      groups.value.forEach((group, i) => {
        const range = group[key],
          point = chart.getDatasetMeta(index).data[i]
        if (!range || !point) return
        const x = point.x + (index ? 4 : -4),
          top = chart.scales[key].getPixelForValue(range[1]),
          bottom = chart.scales[key].getPixelForValue(range[0])
        ctx.beginPath()
        ctx.moveTo(x, top)
        ctx.lineTo(x, bottom)
        ctx.moveTo(x - 4, top)
        ctx.lineTo(x + 4, top)
        ctx.moveTo(x - 4, bottom)
        ctx.lineTo(x + 4, bottom)
        ctx.stroke()
      })
    }
    ctx.restore()
  }
}
const options = computed<ChartOptions<'line'>>(() => {
  const rangeMode = mode.value === 'range'
  const color = resources.runtime.colorMode === 'dark' ? '#bbb' : '#555'
  const grid = resources.runtime.colorMode === 'dark' ? '#ffffff15' : '#00000015'
  const values = groups.value.flatMap((g) => g.rank ?? [])
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    onClick: (_, elements) => {
      const group = groups.value[elements[0]?.index]
      if (group) emit('select', group.point.id)
    },
    plugins: {
      datalabels: { display: false },
      legend: { display: !props.compact, labels: { color } },
      tooltip: {
        callbacks: {
          label: (item) => {
            const group = groups.value[item.dataIndex],
              point = group.point
            if (rangeMode) {
              if (item.datasetIndex === 0 && group.rank)
                return `${t('rank')}: ${props.rankLabel(rankSteps[group.rank[0]])} – ${props.rankLabel(rankSteps[group.rank[1]])}`
              if (group.lp) return `${group.lp[0]} – ${group.lp[1]} LP`
            }
            return item.datasetIndex === 0 ? props.rankLabel(point) : `${point.leaguePoints} LP`
          }
        }
      }
    },
    scales: {
      x: {
        display: !props.compact,
        ticks: { color, maxTicksLimit: 6, maxRotation: 0 },
        grid: { color: grid }
      },
      rank: {
        position: 'left',
        min: Math.max(0, Math.min(...values) - 1),
        max: Math.min(30, Math.max(...values) + 1),
        ticks: {
          color,
          maxTicksLimit: props.compact ? 3 : 8,
          stepSize: 1,
          callback: (value) =>
            rankSteps[Number(value)] ? props.rankLabel(rankSteps[Number(value)]) : ''
        },
        grid: { color: grid }
      },
      lp: {
        position: 'right',
        ticks: { color, maxTicksLimit: props.compact ? 3 : 8, callback: (value) => `${value} LP` },
        grid: { drawOnChartArea: false }
      }
    }
  }
})
</script>
