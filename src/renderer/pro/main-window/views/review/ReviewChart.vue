<template>
  <div class="flex flex-col gap-3">
    <NRadioGroup v-model:value="metric" size="small">
      <NRadioButton v-for="key in metrics" :key="key" :value="key">{{ t(key) }}</NRadioButton>
    </NRadioGroup>
    <div class="h-64"><Line :data="data" :options="options" :plugins="[cursor]" /></div>
  </div>
</template>
<script setup lang="ts">
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { formatGameTime, type ReviewReport } from '@shared/pro/review'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type Plugin,
  type ChartOptions
} from 'chart.js'
import { useTranslation } from 'i18next-vue'
import { NRadioGroup, NRadioButton } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import type { ReviewFinding } from '@shared/pro/review/findings'
import { Line } from 'vue-chartjs'
ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend)
const props = defineProps<{
  reports: ReviewReport[]
  timestamp?: number
  from?: number
  to?: number
  focusWindow?: ReviewFinding['evidence']
}>()
const emit = defineEmits<{ seek: [timestamp: number] }>()
const cursor: Plugin<'line'> = {
  id: 'review-time-cursor',
  afterDraw(chart) {
    if (props.timestamp === undefined) return
    const x = chart.scales.x.getPixelForValue(props.timestamp)
    const { top, bottom, left, right } = chart.chartArea
    if (x < left || x > right) return
    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = resources.runtime.colorMode === 'dark' ? '#ddd' : '#444'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.restore()
  }
}
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const resources = useGameResourceProvider()
const metrics = ['gold', 'cs', 'goldDiff'] as const
const metric = ref<(typeof metrics)[number]>('gold')
watch(
  () => props.focusWindow,
  (value) => {
    if (value) metric.value = value.metric
  },
  { immediate: true }
)
const data = computed(() => ({
  datasets: props.reports.map((report, index) => ({
    label: `${report.summary.gameId} · ${resources.champions.name(report.analysis.metrics.championId ?? -1)}`,
    data: report.analysis.points.flatMap((point, i, points) => {
      const current = { x: point.timestamp, y: point[metric.value] }
      // Allow client sampling jitter; a missing minute still breaks the curve.
      return i && point.timestamp - points[i - 1].timestamp > 90_000
        ? [{ x: points[i - 1].timestamp + 1, y: null }, current]
        : [current]
    }),
    borderColor: index ? '#e8a34d' : '#5b9fe6',
    backgroundColor: index ? '#e8a34d' : '#5b9fe6',
    tension: 0,
    pointRadius: 2,
    spanGaps: false
  }))
}))
const options = computed<ChartOptions<'line'>>(() => {
  const color = resources.runtime.colorMode === 'dark' ? '#bbb' : '#555'
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    onClick: (event, _elements, chart) => {
      if (props.timestamp === undefined || event.x == null || event.y == null) return
      const { left, right, top, bottom } = chart.chartArea
      if (event.x < left || event.x > right || event.y < top || event.y > bottom) return
      const value = chart.scales.x.getValueForPixel(event.x)
      if (value !== undefined) emit('seek', Math.round(value / 1000) * 1000)
    },
    plugins: {
      datalabels: { display: false },
      legend: { labels: { color } },
      tooltip: { callbacks: { title: (items) => formatGameTime(items[0]?.parsed.x ?? 0) } }
    },
    scales: {
      x: {
        type: 'linear',
        min: props.from,
        max: props.to,
        ticks: { color, callback: (value) => formatGameTime(Number(value)) }
      },
      y: { ticks: { color }, title: { display: true, text: t(metric.value), color } }
    }
  }
})
</script>
