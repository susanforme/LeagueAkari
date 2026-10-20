<template>
  <div class="flex flex-col gap-3">
    <div class="flex justify-end">
      <NButton @click="load">{{ t('refresh') }}</NButton>
    </div>
    <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
    <NCard v-for="goal in result?.items" :key="goal.id" size="small" :title="goal.title">
      <template #header-extra
        ><NTag>{{ t(`states.${goal.state}`) }}</NTag></template
      >
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t(`metrics.${goal.metric}`) }} · {{ t(goal.direction) }} {{ goal.target }}</span>
        <span>{{ goal.scope.patch }} · {{ goal.scope.position }}</span>
        <NButton size="small" @click="inspect(goal.id)">{{ t('progress') }}</NButton>
        <template v-if="!['completed', 'abandoned'].includes(goal.state)">
          <NButton
            size="small"
            :disabled="busy"
            @click="change(goal, goal.state === 'active' ? 'paused' : 'active')"
            >{{ t(goal.state === 'active' ? 'pause' : 'activate') }}</NButton
          >
          <NButton size="small" :disabled="busy" @click="change(goal, 'completed')">{{
            t('complete')
          }}</NButton>
          <NButton size="small" :disabled="busy" @click="change(goal, 'abandoned')">{{
            t('abandon')
          }}</NButton>
        </template>
      </div>
    </NCard>
    <NEmpty v-if="result && !result.total" :description="t('goalsEmpty')" />
    <NPagination
      v-if="result && result.total > 30"
      v-model:page="page"
      :page-size="30"
      :item-count="result.total"
    />
    <NModal
      v-model:show="show"
      preset="card"
      :title="progress?.goal.title"
      class="w-200! max-w-[95vw]!"
    >
      <template v-if="progress">
        <span>{{ t('samples', { count: progress.samples.length }) }}</span>
        <div class="h-64"><Line :data="chartData" :options="chartOptions" /></div>
        <div class="flex flex-wrap gap-2">
          <NButton
            v-for="sample in progress.samples"
            :key="sample.reportId"
            text
            size="small"
            @click="open(sample.reportId)"
            >{{ sample.gameId }} · {{ sample.value.toFixed(2) }}</NButton
          >
        </div>
        <NCollapse class="mt-3"
          ><NCollapseItem :title="t('frozenBaseline')" name="baseline"
            ><div class="flex flex-wrap gap-2">
              <NButton
                v-for="sample in progress.goal.baseline"
                :key="sample.reportId"
                text
                size="small"
                @click="open(sample.reportId)"
                >{{ sample.gameId }} · {{ sample.value.toFixed(2) }}</NButton
              >
            </div></NCollapseItem
          ></NCollapse
        >
      </template>
    </NModal>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onScopeDispose } from 'vue'
import {
  NButton,
  NAlert,
  NCard,
  NTag,
  NEmpty,
  NPagination,
  NModal,
  NCollapse,
  NCollapseItem,
  useDialog
} from 'naive-ui'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { useTranslation } from 'i18next-vue'
import { useRouter } from 'vue-router'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { REVIEW_ROUTE } from '@shared/pro/review'
import type { TrainingGoal, GoalProgress } from '@shared/pro/progress'
import { ProgressRenderer } from '../../../shared/shards/progress'
ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend)
const api = useInstance(ProgressRenderer),
  router = useRouter(),
  dialog = useDialog(),
  resources = useGameResourceProvider(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const result = shallowRef<{ items: TrainingGoal[]; total: number } | null>(null),
  page = ref(1),
  error = ref(false),
  busy = ref(false),
  show = ref(false),
  progress = shallowRef<GoalProgress | null>(null)
let generation = 0,
  detailGeneration = 0
async function load() {
  const g = ++generation
  error.value = false
  try {
    const next = await api.goals(page.value)
    if (g === generation) result.value = next
  } catch {
    if (g === generation) error.value = true
  }
}
async function inspect(id: string) {
  const g = ++detailGeneration
  try {
    const next = await api.progress(id)
    if (g === detailGeneration) {
      progress.value = next
      show.value = true
    }
  } catch {
    error.value = true
  }
}
function change(goal: TrainingGoal, state: TrainingGoal['state']) {
  const run = async () => {
    if (busy.value) return
    busy.value = true
    error.value = false
    try {
      await api.changeGoal({ id: goal.id, revision: goal.revision, state })
      await load()
    } catch {
      error.value = true
    } finally {
      busy.value = false
    }
  }
  if (['completed', 'abandoned'].includes(state))
    dialog.warning({
      title: t(state === 'completed' ? 'complete' : 'abandon'),
      content: t('finishGoal'),
      positiveText: t('confirm'),
      negativeText: t('cancel'),
      onPositiveClick: run
    })
  else void run()
}
function open(id: string) {
  show.value = false
  void router.push({ name: REVIEW_ROUTE, query: { id } })
}
const chartData = computed(() => {
  const p = progress.value
  const values = (p?.goal.baseline ?? []).map((s) => s.value).sort((a, b) => a - b)
  const median = values.length
    ? (values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2
    : null
  const count = Math.max(1, p?.samples.length ?? 0)
  return {
    datasets: [
      {
        label: t('current'),
        data: (p?.samples ?? []).map((s, i) => ({ x: i + 1, y: s.value })),
        borderColor: '#5b9fe6',
        backgroundColor: '#5b9fe6',
        pointRadius: 4
      },
      {
        label: t('target'),
        data: [
          { x: 1, y: p?.goal.target ?? null },
          { x: count, y: p?.goal.target ?? null }
        ],
        borderColor: '#54ad83',
        pointRadius: 0
      },
      {
        label: t('median'),
        data: [
          { x: 1, y: median },
          { x: count, y: median }
        ],
        borderColor: '#e8a34d',
        borderDash: [4, 4],
        pointRadius: 0
      }
    ]
  }
})
const chartOptions = computed<ChartOptions<'line'>>(() => {
  const color = resources.runtime.colorMode === 'dark' ? '#bbb' : '#555'
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { datalabels: { display: false }, legend: { labels: { color } } },
    scales: { x: { type: 'linear', ticks: { color, stepSize: 1 } }, y: { ticks: { color } } }
  }
})
watch(page, load)
onMounted(load)
onScopeDispose(() => {
  generation++
  detailGeneration++
})
</script>
