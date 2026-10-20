<template>
  <div class="flex min-w-24 flex-col gap-1.5">
    <MetricValue :metric="metric" :ratio="ratio" />
    <div
      v-if="metric.value !== null"
      class="relative h-1.5 overflow-hidden rounded bg-(--la-card-muted-surface)"
      aria-hidden="true"
    >
      <span
        v-if="!ratio"
        class="absolute top-0 bottom-0 left-1/2 w-px bg-(--la-color-text-primary)/40"
      />
      <span
        class="absolute top-0 h-full rounded"
        :class="ratio || metric.value >= 0 ? 'bg-emerald-500' : 'bg-rose-500'"
        :style="{ left: `${ratio ? 0 : metric.value < 0 ? 50 - width : 50}%`, width: `${width}%` }"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { SampleMetric } from '@shared/pro/champion-pool'
import MetricValue from './MetricValue.vue'
const props = defineProps<{ metric: SampleMetric; ratio?: boolean; scale?: number }>()
const width = computed(() =>
  props.ratio
    ? Math.max(0, Math.min(100, (props.metric.value ?? 0) * 100))
    : Math.min(50, (Math.abs(props.metric.value ?? 0) / Math.max(1, props.scale ?? 1)) * 50)
)
</script>
