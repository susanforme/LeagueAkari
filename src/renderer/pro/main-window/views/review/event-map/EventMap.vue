<template>
  <NCard size="small" :title="t('title')">
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <NSelect v-model:value="kind" class="w-44!" :options="options" :aria-label="t('filter')" />
        <NCheckbox v-model:checked="nearby">{{ t('nearby') }}</NCheckbox>
      </div>
      <NEmpty v-if="!background" :description="t('unsupported')" />
      <template v-else>
        <div class="flex flex-wrap gap-3 text-xs">
          <span v-for="category in eventKinds.slice(1)" :key="category"
            >{{ symbols[category as keyof typeof symbols] }} {{ t(category) }}</span
          >
        </div>
        <div class="event-map relative mx-auto aspect-square w-full max-w-96">
          <img :src="background" :alt="t('title')" class="absolute h-full w-full rounded" />
          <NButton
            v-for="point in mapped.points"
            :key="point.event.id"
            circle
            size="tiny"
            class="marker absolute! -translate-x-1/2 -translate-y-1/2"
            :class="{ selected: point.event.id === selectedId }"
            :type="
              point.category === 'deaths'
                ? 'error'
                : point.category === 'kills'
                  ? 'info'
                  : point.category === 'objectives'
                    ? 'warning'
                    : 'success'
            "
            :style="{
              left: `${point.left}%`,
              top: `${point.top}%`,
              zIndex: point.event.id === selectedId ? 2 : 1
            }"
            :aria-label="label(point.event)"
            :title="label(point.event)"
            :aria-pressed="point.event.id === selectedId"
            @click="$emit('select', point.event)"
            >{{ symbols[point.category] }}</NButton
          >
        </div>
        <span v-if="selected" class="text-sm">{{ label(selected) }}</span>
        <span v-if="mapped.missing" class="text-xs opacity-60">{{
          t('missing', { count: mapped.missing })
        }}</span>
        <NEmpty v-if="!mapped.points.length" :description="t('empty')" />
      </template>
    </div>
  </NCard>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NCard, NSelect, NCheckbox, NButton, NEmpty } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import map11 from '@renderer-shared/components/match-card/map-images/11.png'
import map12 from '@renderer-shared/components/match-card/map-images/12.png'
import map21 from '@renderer-shared/components/match-card/map-images/21.png'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { formatGameTime, type ReviewReport, type ReviewEvent } from '@shared/pro/review'
import { eventKinds, mapEvents, type EventKind } from './points'
const props = defineProps<{
  report: ReviewReport
  from: number
  to: number
  selectedId: string | null
  describe: (event: ReviewEvent) => string
}>()
defineEmits<{ select: [event: ReviewEvent] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.eventMap' })
const kind = ref<EventKind>('all'),
  nearby = ref(false)
const symbols = { deaths: '×', kills: '⚔', objectives: '◆', buildings: '■' }
const mapId = computed(() => toBasicInfo(props.report.summary).mapId)
const background = computed(
  () => (({ 11: map11, 12: map12, 21: map21 }) as Record<number, string>)[mapId.value]
)
const options = computed(() => eventKinds.map((value) => ({ value, label: t(value) })))
const mapped = computed(() =>
  mapEvents(
    props.report.analysis.events,
    mapId.value,
    props.report.analysis.participantId,
    kind.value,
    nearby.value ? props.from : 0,
    nearby.value ? props.to : props.report.analysis.duration
  )
)
const selected = computed(() => props.report.analysis.events.find((e) => e.id === props.selectedId))
const label = (event: ReviewEvent) =>
  `${formatGameTime(event.timestamp)} · ${props.describe(event)}`
watch(
  () => props.report.id,
  () => {
    kind.value = 'all'
    nearby.value = false
  }
)
</script>
<style scoped>
.marker.selected {
  outline: 3px solid white;
  outline-offset: 2px;
}
.marker:focus-visible {
  outline: 3px solid white;
  outline-offset: 2px;
  z-index: 3 !important;
}
</style>
