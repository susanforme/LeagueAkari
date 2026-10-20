<template>
  <NCard size="small" :title="t('title')" class="review-timeline">
    <div class="flex flex-wrap items-center gap-2">
      <NButton size="small" :disabled="!previous" @click="previous && emit('select', previous)">{{
        t('previous')
      }}</NButton>
      <NButton size="small" :disabled="!next" @click="next && emit('select', next)">{{
        t('next')
      }}</NButton>
      <NButton
        size="small"
        :disabled="timestamp <= 0"
        :aria-label="t('back')"
        @click="seek(timestamp - 10_000)"
        >−10s</NButton
      >
      <NButton
        size="small"
        :disabled="timestamp >= duration"
        :aria-label="t('forward')"
        @click="seek(timestamp + 10_000)"
        >+10s</NButton
      >
      <NInput
        v-model:value="input"
        class="w-28!"
        :status="invalid ? 'error' : undefined"
        :input-props="{ 'aria-label': t('time'), 'aria-invalid': invalid }"
        @keydown.enter="submit"
        @blur="submit"
      />
      <span class="tabular-nums opacity-60">/ {{ formatGameTime(duration) }}</span>
      <NButton
        size="small"
        :type="zoomed ? 'primary' : 'default'"
        :aria-pressed="zoomed"
        @click="toggleZoom"
        >{{ t(zoomed ? 'full' : 'zoom') }}</NButton
      >
    </div>
    <div v-if="invalid" role="alert" class="mt-2 text-xs">{{ t('invalid') }}</div>
    <div class="mt-3 flex flex-wrap gap-2"><slot /></div>
    <div class="mt-4 grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <span class="text-xs opacity-60">{{ formatGameTime(timestamp) }}</span>
      <div ref="track" class="relative min-w-0" @pointermove="preview" @pointerleave="hover = null">
        <span v-if="hover !== null" class="preview" :style="{ left: `${percent(hover)}%` }">{{
          formatGameTime(hover)
        }}</span>
        <input
          class="seek"
          type="range"
          :min="range.from"
          :max="range.to"
          :step="1000"
          :value="timestamp"
          :disabled="duration <= 0"
          :aria-label="t('seek')"
          :aria-valuetext="`${formatGameTime(timestamp)} / ${formatGameTime(duration)}`"
          @input="seek(Number(($event.target as HTMLInputElement).value))"
          @keydown="keyboard"
        />
      </div>
      <span />
      <div class="flex justify-between text-xs tabular-nums opacity-60">
        <span v-for="tick in ticks" :key="tick">{{ formatGameTime(tick) }}</span>
      </div>
      <template v-for="lane in lanes" :key="lane.kind">
        <span class="flex items-center gap-1 text-xs"
          ><NIcon
            :component="eventIcons[lane.kind]"
            :class="eventColors[lane.kind]"
            :size="16"
            aria-hidden="true"
          />{{ tm(lane.kind) }}</span
        >
        <div class="lane relative h-9 min-w-0 rounded">
          <span class="cursor" :style="{ left: `${percent(timestamp)}%` }" />
          <NPopover
            v-for="group in lane.groups"
            :key="group.left"
            trigger="click"
            :disabled="group.events.length === 1"
            :width="300"
            scrollable
            style="max-height: 220px"
          >
            <template #trigger>
              <NButton
                size="tiny"
                class="absolute! top-1/2 -translate-x-1/2 -translate-y-1/2"
                :style="{ left: `${group.left}%` }"
                :type="group.events.some((e) => e.id === selectedId) ? 'primary' : 'default'"
                :aria-pressed="group.events.some((e) => e.id === selectedId)"
                :aria-label="
                  group.events.length === 1
                    ? label(group.events[0])
                    : t('cluster', {
                        count: group.events.length,
                        time: formatGameTime(group.events[0].timestamp)
                      })
                "
                :title="group.events.length === 1 ? label(group.events[0]) : undefined"
                @click="group.events.length === 1 && emit('select', group.events[0])"
                ><NIcon
                  :component="eventIcons[lane.kind]"
                  :class="
                    group.events.some((e) => e.id === selectedId)
                      ? undefined
                      : eventColors[lane.kind]
                  "
                  :size="16"
                  aria-hidden="true"
                /><span v-if="group.events.length > 1"> {{ group.events.length }}</span></NButton
              >
            </template>
            <div class="flex flex-col gap-2">
              <NButton
                v-for="event in group.events"
                :key="event.id"
                size="small"
                :type="event.id === selectedId ? 'primary' : 'default'"
                @click="emit('select', event)"
                >{{ label(event) }}</NButton
              >
            </div>
          </NPopover>
        </div>
      </template>
    </div>
    <NEmpty v-if="!events.length" size="small" class="mt-3" :description="t('empty')" />
    <div v-if="selected" class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span>{{ label(selected) }}</span>
      <NButton size="tiny" @click="seek(selected.timestamp - 30_000)">{{ t('leadIn') }}</NButton>
    </div>
  </NCard>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { NButton, NCard, NInput, NEmpty, NPopover, NIcon } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { formatGameTime, type ReviewEvent } from '@shared/pro/review'
import { eventIcons, eventColors } from '../event-map/icons'
import { eventKind, eventKinds } from '../event-map/points'
import { adjacentEvent, groupEvents, parseTime, timelineRange } from './navigation'
const props = defineProps<{
  events: ReviewEvent[]
  timestamp: number
  duration: number
  participantId: number
  selectedId: string | null
  describe: (event: ReviewEvent) => string
}>()
const emit = defineEmits<{ seek: [timestamp: number]; select: [event: ReviewEvent] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.timeline' })
const { t: tm } = useTranslation(undefined, { keyPrefix: 'pro.eventMap' })
const input = ref('0:00'),
  invalid = ref(false),
  zoomed = ref(false),
  hover = ref<number | null>(null)
const range = ref({ from: 0, to: props.duration })
const track = ref<HTMLElement>()
const { width } = useElementSize(track)
const sorted = computed(() => [...props.events].sort((a, b) => a.timestamp - b.timestamp))
const previous = computed(() => adjacentEvent(sorted.value, props.timestamp, props.selectedId, -1))
const next = computed(() => adjacentEvent(sorted.value, props.timestamp, props.selectedId, 1))
const selected = computed(() => props.events.find((e) => e.id === props.selectedId))
const lanes = computed(() =>
  eventKinds
    .filter((kind) => kind !== 'all')
    .map((kind) => ({
      kind,
      groups: groupEvents(
        sorted.value.filter((e) => eventKind(e, props.participantId) === kind),
        range.value.from,
        range.value.to,
        width.value
      )
    }))
)
const ticks = computed(() =>
  Array.from({ length: width.value < 360 ? 3 : 5 }, (_, i) => i).map(
    (i, _, list) => range.value.from + ((range.value.to - range.value.from) * i) / (list.length - 1)
  )
)
const percent = (value: number) =>
  Math.max(
    0,
    Math.min(
      100,
      ((value - range.value.from) / Math.max(1, range.value.to - range.value.from)) * 100
    )
  )
const label = (event: ReviewEvent) =>
  `${formatGameTime(event.timestamp)} · ${props.describe(event)}`
function seek(value: number) {
  emit('seek', Math.max(0, Math.min(props.duration, value)))
}
function submit() {
  const value = parseTime(input.value, props.duration)
  invalid.value = value === null
  if (value !== null && value !== Math.floor(props.timestamp / 1000) * 1000) seek(value)
}
function toggleZoom() {
  zoomed.value = !zoomed.value
  range.value = zoomed.value
    ? timelineRange(props.timestamp, props.duration, 180_000)
    : { from: 0, to: props.duration }
}
function preview(event: PointerEvent) {
  const box = track.value?.getBoundingClientRect()
  if (box?.width)
    hover.value =
      range.value.from +
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) *
        (range.value.to - range.value.from)
}
function keyboard(event: KeyboardEvent) {
  const values: Record<string, number> = {
    Home: range.value.from,
    End: range.value.to,
    PageUp: props.timestamp + 10_000,
    PageDown: props.timestamp - 10_000
  }
  if (event.key in values) {
    event.preventDefault()
    seek(Math.max(range.value.from, Math.min(range.value.to, values[event.key])))
  }
}
watch(
  () => props.timestamp,
  (value) => {
    input.value = formatGameTime(value)
    invalid.value = false
    if (zoomed.value && (value < range.value.from || value > range.value.to))
      range.value = timelineRange(value, props.duration, 180_000)
  },
  { immediate: true }
)
</script>
<style scoped>
.seek {
  display: block;
  appearance: none;
  width: 100%;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.seek::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: var(--la-color-popover-border);
}
.seek::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5px;
  border: 2px solid var(--la-color-bg-primary);
  border-radius: 50%;
  background: var(--la-color-link, #5b9fe6);
}
.seek:focus-visible {
  outline: 2px solid var(--la-color-link, #5b9fe6);
  outline-offset: 2px;
}
.seek:disabled {
  opacity: 0.4;
  cursor: default;
}
.lane {
  background: var(--la-card-muted-surface);
  border: 1px solid var(--la-color-popover-border);
}
.cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--la-color-link, #5b9fe6);
  pointer-events: none;
}
.preview {
  position: absolute;
  bottom: 100%;
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--la-color-popconfirm-bg);
  font-size: 12px;
  pointer-events: none;
}
</style>
