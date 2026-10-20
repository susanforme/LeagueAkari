<template>
  <NTooltip>
    <template #trigger>
      <span class="tabular-nums" tabindex="0">{{ formatted }}</span>
    </template>
    <div>{{ t('metricSamples', { count: metric.samples }) }}</div>
    <div v-for="[reason, count] of exclusions" :key="reason">{{ t(reason) }}: {{ count }}</div>
    <div v-if="kda">{{ t('kdaRule') }}</div>
  </NTooltip>
</template>

<script setup lang="ts">
import type { SampleMetric } from '@shared/pro/champion-pool'
import { useTranslation } from 'i18next-vue'
import { NTooltip } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{ metric: SampleMetric; ratio?: boolean; kda?: boolean }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const exclusions = computed(() =>
  Object.entries(props.metric.excluded).filter(([, count]) => count! > 0)
)
const formatted = computed(() =>
  props.metric.value === null
    ? '—'
    : props.ratio
      ? `${(props.metric.value * 100).toFixed(1)}%`
      : props.metric.value.toFixed(2)
)
</script>
