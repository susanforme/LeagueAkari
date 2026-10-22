<template>
  <NCard size="small" :title="t('baseline')">
    <template #header-extra
      ><NCheckbox v-model:checked="allChampions">{{ t('allChampions') }}</NCheckbox></template
    >

    <NSpin :show="loading && !insights">
      <div class="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
        <div
          v-for="item in primaryMetrics"
          :key="item.id"
          class="rounded-lg bg-(--la-card-muted-surface) p-4"
        >
          <div class="mb-3 text-sm font-medium">{{ t(`metrics.${item.id}`) }}</div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <div class="mb-1 text-xs opacity-60">{{ t('current') }}</div>
              <span class="text-lg font-semibold tabular-nums">{{ format(item.current) }}</span>
            </div>
            <div>
              <div class="mb-1 text-xs opacity-60">{{ t('median') }}</div>
              <span class="text-lg tabular-nums">{{ format(item.median) }}</span>
            </div>
            <div>
              <div class="mb-1 text-xs opacity-60">{{ t('difference') }}</div>
              <span
                class="text-lg font-semibold tabular-nums"
                :class="
                  item.current !== null && item.median !== null
                    ? item.current >= item.median
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                    : ''
                "
                >{{
                  item.current === null || item.median === null
                    ? '—'
                    : `${item.current > item.median ? '+' : ''}${format(item.current - item.median)}`
                }}</span
              >
            </div>
          </div>
          <div class="mt-3 text-xs opacity-60">
            {{ t('samples', { count: item.samples.length })
            }}<span v-if="item.median === null"> · {{ t('insufficient') }}</span>
          </div>
        </div>
      </div>
      <NCollapse
        ><NCollapseItem :title="t('baselineDetails')" name="baseline-details">
          <NCollapse>
            <NCollapseItem
              v-for="metric in insights?.metrics"
              :key="metric.id"
              :name="metric.id"
              :title="t(`metrics.${metric.id}`)"
            >
              <div class="flex flex-wrap gap-4">
                <span>{{ t('current') }}: {{ format(metric.current) }}</span
                ><span>{{ t('median') }}: {{ format(metric.median) }}</span
                ><span
                  >{{ t('quartiles') }}: {{ format(metric.q1) }} – {{ format(metric.q3) }}</span
                >
                <span
                  >{{ t('difference') }}:
                  {{
                    format(
                      metric.current === null || metric.median === null
                        ? null
                        : metric.current - metric.median
                    )
                  }}</span
                >
                <span>{{ t('samples', { count: metric.samples.length }) }}</span>
                <span v-if="metric.samples.length < 5">{{ t('insufficient') }}</span>
                <span v-if="isRule(metric.id)">{{
                  t('occurrences', {
                    count: metric.samples.filter((s) => s.value === 1).length,
                    total: metric.samples.length
                  })
                }}</span>
                <NButton size="tiny" @click="create(metric.id)">{{ t('createGoal') }}</NButton>
              </div>
              <div class="mt-2 flex flex-wrap gap-3">
                <NButton
                  v-for="sample in metric.samples"
                  :key="sample.reportId"
                  text
                  size="tiny"
                  @click="
                    router.push({
                      name: REVIEW_ROUTE,
                      query: { id: sample.reportId, time: sample.timestamp }
                    })
                  "
                  >{{ sample.gameId }} · {{ format(sample.value) }}</NButton
                >
              </div>
            </NCollapseItem>
          </NCollapse>
        </NCollapseItem></NCollapse
      >
    </NSpin>
    <NModal v-model:show="show" preset="card" :title="t('createGoal')" class="w-120! max-w-[95vw]!">
      <div class="flex flex-col gap-3">
        <NInput v-model:value="title" :maxlength="120" :placeholder="t('goalTitle')" />
        <NSelect
          v-model:value="direction"
          :options="[
            { value: 'increase', label: t('increase') },
            { value: 'decrease', label: t('decrease') }
          ]"
        />
        <NInputNumber
          v-model:value="target"
          :min="['goldDiff10', 'goldDiff15'].includes(metric) ? -100000 : 0"
          :max="isRule(metric) ? 1 : 100000"
          :placeholder="t('target')"
        />
        <NAlert v-if="saveError" type="error">{{ t('failed') }}</NAlert>
        <NButton
          type="primary"
          :loading="saving"
          :disabled="!title.trim() || target === null"
          @click="save"
          >{{ t('save') }}</NButton
        >
      </div>
    </NModal>
  </NCard>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import { computed, ref, watch, toRef } from 'vue'
import { usePersonalBaseline } from './usePersonalBaseline'
import {
  NCard,
  NCheckbox,
  NAlert,
  NSpin,
  NCollapse,
  NCollapseItem,
  NButton,
  NModal,
  NInput,
  NSelect,
  NInputNumber
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useRouter } from 'vue-router'
import { useInstance } from '@renderer-shared/shards'
import { REVIEW_ROUTE, type ReviewReport } from '@shared/pro/review'
import { PROGRESS_ROUTE, type Insights, type MetricId } from '@shared/pro/progress'
import { ProgressRenderer } from '../../../shared/shards/progress'
const props = defineProps<{ report: ReviewReport }>(),
  api = useInstance(ProgressRenderer),
  router = useRouter(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const emit = defineEmits<{ baseline: [reportId: string, insights: Insights | null] }>()
const allChampions = ref(false),
  show = ref(false),
  saving = ref(false),
  saveError = ref(false),
  title = ref(''),
  target = ref<number | null>(null),
  direction = ref<'increase' | 'decrease'>('increase'),
  metric = ref<MetricId>('cs10')
const { insights, loading, error } = usePersonalBaseline(
  toRef(() => props.report.id),
  allChampions
)
const primaryMetrics = computed(
  () =>
    insights.value?.metrics.filter((metric) =>
      ['cs10', 'cs15', 'goldDiff10'].includes(metric.id)
    ) ?? []
)
watch(
  insights,
  (value) => {
    if (!allChampions.value) emit('baseline', props.report.id, value)
  },
  { flush: 'sync', immediate: true }
)
const format = (n: number | null) => (n === null ? '—' : Number(n.toFixed(2)).toLocaleString())
const isRule = (id: MetricId) => ['goldDeficit10', 'deathBeforeObjective'].includes(id)

function create(id: MetricId) {
  metric.value = id
  title.value = t(`metrics.${id}`)
  target.value = null
  direction.value = ['deathsPer10', 'goldDeficit10', 'deathBeforeObjective'].includes(id)
    ? 'decrease'
    : 'increase'
  saveError.value = false
  show.value = true
}
async function save() {
  if (saving.value || target.value === null) return
  saving.value = true
  saveError.value = false
  try {
    await api.createGoal({
      reportId: props.report.id,
      allChampions: allChampions.value,
      metric: metric.value,
      title: title.value,
      target: target.value,
      direction: direction.value
    })
    show.value = false
    await router.push({ name: PROGRESS_ROUTE })
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}
useRefreshFeedback(
  () => error.value,
  () => t('failed')
)
</script>
