<template>
  <NCard size="small" :title="t('baseline')">
    <template #header-extra
      ><NCheckbox v-model:checked="allChampions">{{ t('allChampions') }}</NCheckbox></template
    >
    <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
    <NSpin :show="loading">
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
            ><span>{{ t('quartiles') }}: {{ format(metric.q1) }} – {{ format(metric.q3) }}</span>
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
import { ref, watch, toRef } from 'vue'
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
watch(
  insights,
  (value) => {
    if (!allChampions.value) emit('baseline', props.report.id, value)
  },
  { flush: 'sync' }
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
</script>
