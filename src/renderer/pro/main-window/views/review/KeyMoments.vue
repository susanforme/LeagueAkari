<template>
  <ReviewTimeline
    compact
    :events="events"
    :timestamp="timestamp"
    :duration="report.analysis.duration"
    :participant-id="report.analysis.participantId"
    :selected-id="selectedId"
    :describe="describe"
    @seek="seek"
    @select="select"
  >
    <template #footer>
      <div class="mt-3 flex justify-end">
        <NButton
          size="small"
          :disabled="!events.length"
          @click="$emit('locate', timestamp, selectedId)"
        >
          {{ t('inspectMoment') }} · {{ formatGameTime(timestamp) }}
        </NButton>
      </div>
    </template>
  </ReviewTimeline>
</template>
<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { NButton } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { formatGameTime, type ReviewEvent, type ReviewReport } from '@shared/pro/review'
import { eventKind } from './event-map/points'
import { useEventDescription } from './useEventDescription'
import ReviewTimeline from './timeline/ReviewTimeline.vue'
const props = defineProps<{ report: ReviewReport }>()
defineEmits<{ locate: [timestamp: number, eventId: string | null] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const { describe } = useEventDescription(toRef(() => props.report))
const timestamp = ref(0)
const selectedId = ref<string | null>(null)
const events = computed(() =>
  props.report.analysis.events.filter((event) =>
    eventKind(event, props.report.analysis.participantId)
  )
)
function seek(value: number) {
  timestamp.value = value
  selectedId.value = null
}
function select(event: ReviewEvent) {
  timestamp.value = event.timestamp
  selectedId.value = event.id
}
</script>
