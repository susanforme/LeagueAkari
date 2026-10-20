<template>
  <div class="h-44" role="img" :aria-label="label">
    <Bar :data="chartData" :options="options" />
  </div>
</template>

<script setup lang="ts">
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { PoolResult } from '@shared/pro/champion-pool'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartOptions
} from 'chart.js'
import { computed } from 'vue'
import { useThemeVars } from 'naive-ui'
import { Bar } from 'vue-chartjs'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)
const props = defineProps<{ champions: PoolResult['topChampions']; label: string }>()
const emit = defineEmits<{ select: [id: number] }>()
const resources = useGameResourceProvider()
const theme = useThemeVars()
const chartData = computed(() => ({
  labels: props.champions.map((c) => resources.champions.name(c.championId ?? -1)),
  datasets: [
    {
      label: props.label,
      data: props.champions.map((c) => c.games),
      backgroundColor: theme.value.primaryColor,
      borderRadius: 3
    }
  ]
}))
const options = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, ticks: { precision: 0, color: theme.value.textColor2 } },
    y: { ticks: { color: theme.value.textColor1 }, grid: { display: false } }
  },
  onClick: (_, elements) => {
    const id = props.champions[elements[0]?.index]?.championId
    if (id) emit('select', id)
  }
}))
</script>
