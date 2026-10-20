<template>
  <NCard v-if="findings.length" size="small" :title="t('title')" class="mb-4">
    <div class="flex flex-col gap-4">
      <div v-for="finding in findings" :key="finding.kind">
        <NButton
          v-if="finding.evidence"
          text
          type="primary"
          @click="$emit('locate', finding.evidence)"
          >{{ t(`${finding.kind}Title`) }} · {{ formatGameTime(finding.evidence.from) }}–{{
            formatGameTime(finding.evidence.to)
          }}</NButton
        >
        <div v-else class="font-medium">{{ t(`${finding.kind}Title`) }}</div>
        <div class="mt-1 text-sm">
          {{
            t(finding.kind === 'farm' && !finding.evidence ? 'farmSummary' : finding.kind, {
              value: format(finding.value),
              baseline: format(finding.baseline),
              time: formatGameTime(finding.value)
            })
          }}
        </div>
        <div
          v-if="finding.samples"
          class="mt-1 flex flex-wrap items-center gap-3 text-xs opacity-75"
        >
          <span>{{ t('sampleScope', { count: finding.samples }) }}</span>
          <span v-if="finding.occurrences !== undefined">{{
            t('occurrences', { count: finding.occurrences })
          }}</span>
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
import { NButton, NCard } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{ report: ReviewReport; insights: Insights | null }>()
defineEmits<{
  locate: [evidence: NonNullable<ReviewFinding['evidence']>]
  compare: [reportId: string, timestamp?: number]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review.findings' })
const findings = computed(() => reviewFindings(props.report, props.insights))
const format = (value?: number) =>
  value === undefined ? '—' : Number(value.toFixed(1)).toLocaleString()
</script>
