<template>
  <NCard v-if="findings.length" size="small" :title="t('title')" class="mb-4">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
      <div
        v-for="finding in findings"
        :key="finding.kind"
        class="flex min-w-0 flex-col gap-3 rounded-lg border border-(--la-color-popover-border) p-3"
      >
        <div class="flex items-center gap-2">
          <NIcon
            :component="icons[finding.kind]"
            :size="22"
            class="text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          /><span class="text-sm font-medium">{{ t(`${finding.kind}Title`) }}</span>
        </div>
        <template v-if="finding.kind === 'deathBeforeObjective'">
          <div class="flex items-center gap-3 py-2">
            <span class="text-2xl font-semibold tabular-nums">{{
              formatGameTime(finding.value)
            }}</span
            ><NIcon :component="ArrowRight" :size="18" aria-hidden="true" /><NIcon
              :component="Flame"
              :size="28"
              aria-hidden="true"
            /><span class="text-xs">{{ tv('withinMinute') }}</span>
          </div>
        </template>
        <template v-else>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-semibold tabular-nums"
              >{{ finding.kind === 'goldDrop' || finding.kind === 'goldDeficit' ? '−' : ''
              }}{{ format(finding.value) }}</span
            ><span class="text-xs opacity-65">{{
              tv(
                finding.kind === 'farm'
                  ? finding.evidence
                    ? 'cs'
                    : 'csPerMin'
                  : finding.kind === 'deaths'
                    ? 'deathsPer10'
                    : 'gold'
              )
            }}</span>
          </div>
          <div v-if="finding.baseline !== undefined" class="flex flex-col gap-2">
            <div
              v-for="item in [
                { label: tv('current'), value: finding.value },
                { label: tv('median'), value: finding.baseline }
              ]"
              :key="item.label"
            >
              <div class="mb-1 flex justify-between gap-2 text-xs">
                <span>{{ item.label }}</span
                ><span>{{ format(item.value) }}</span>
              </div>
              <NProgress
                type="line"
                :percentage="(item.value / Math.max(1, finding.value, finding.baseline)) * 100"
                :show-indicator="false"
                :height="5"
                :color="item.value === finding.value ? '#d99b3c' : '#5b9fe6'"
              />
            </div>
          </div>
        </template>
        <div
          v-if="finding.samples"
          class="flex flex-wrap gap-2 text-xs opacity-70"
          :title="t('sampleScope', { count: finding.samples })"
        >
          <span>{{ tv('samples', { count: finding.samples }) }}</span
          ><span v-if="finding.occurrences !== undefined">{{
            t('occurrences', { count: finding.occurrences })
          }}</span>
        </div>
        <div class="mt-auto flex flex-wrap items-center gap-2">
          <NButton v-if="finding.evidence" size="tiny" @click="$emit('locate', finding.evidence)"
            ><template #icon><NIcon :component="MapPin" /></template
            >{{ formatGameTime(finding.evidence.from) }}–{{
              formatGameTime(finding.evidence.to)
            }}</NButton
          >
          <FocusGoalButton
            :report="report"
            :timestamp="finding.evidence?.from ?? 0"
            :suggestion="t(`goals.${finding.kind}`)"
          />
          <NButton
            v-if="finding.comparisonId"
            text
            size="tiny"
            @click="$emit('compare', finding.comparisonId, finding.evidence?.to)"
            >{{ t('compare') }}</NButton
          >
        </div>
      </div>
    </div>
  </NCard>
</template>
<script setup lang="ts">
import type { Insights } from '@shared/pro/progress'
import { formatGameTime, type ReviewReport } from '@shared/pro/review'
import { reviewFindings, type ReviewFinding } from '@shared/pro/review/findings'
import { useTranslation } from 'i18next-vue'
import { NButton, NCard, NIcon, NProgress } from 'naive-ui'
import { Coin, Plant2, X, Flame, ArrowRight, MapPin } from '@vicons/tabler'
import { computed } from 'vue'
import FocusGoalButton from '../../../shared/components/focus-goal/FocusGoalButton.vue'

const props = defineProps<{ report: ReviewReport; insights: Insights | null }>()
defineEmits<{
  locate: [evidence: NonNullable<ReviewFinding['evidence']>]
  compare: [reportId: string, timestamp?: number]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review.findings' })
const { t: tv } = useTranslation(undefined, { keyPrefix: 'pro.visual' })
const icons = {
  goldDrop: Coin,
  goldDeficit: Coin,
  farm: Plant2,
  deaths: X,
  deathBeforeObjective: Flame
}
const findings = computed(() => reviewFindings(props.report, props.insights))
const format = (value?: number) =>
  value === undefined ? '—' : Number(value.toFixed(1)).toLocaleString()
</script>
