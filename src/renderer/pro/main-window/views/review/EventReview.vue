<template>
  <div class="flex flex-col gap-3">
    <ReviewTimeline
      :events="filteredEvents"
      :timestamp="timestamp"
      :duration="report.analysis.duration"
      :participant-id="report.analysis.participantId"
      :selected-id="eventId"
      :describe="describe"
      @seek="seek"
      @select="locateEvent"
    >
      <NSelect
        v-model:value="kind"
        class="w-44!"
        :options="kindOptions"
        :aria-label="tm('filter')"
      />
      <NSelect v-model:value="team" class="w-36!" :options="teamOptions" :aria-label="tm('team')" />
    </ReviewTimeline>
    <div class="flex items-center gap-2">
      <span>{{ tw('windowSeconds') }}</span
      ><NInputNumber
        v-model:value="radius"
        :min="15"
        :max="600"
        class="w-32!"
        :input-props="{ 'aria-label': tw('windowSeconds') }"
      />
    </div>
    <div class="flex flex-wrap gap-4 text-sm">
      <span>{{ formatGameTime(window.from) }} – {{ formatGameTime(window.to) }}</span>
      <span
        >{{ t('observedFrames') }}:
        {{ window.before ? formatGameTime(window.before.timestamp) : '—' }} →
        {{ window.after ? formatGameTime(window.after.timestamp) : '—' }}</span
      >
      <span>{{ t('goldChange') }}: {{ delta('gold') }}</span>
      <span>{{ t('csChange') }}: {{ delta('cs') }}</span>
      <span>{{ t('goldDiffChange') }}: {{ delta('goldDiff') }}</span>
    </div>
    <div class="flex flex-wrap items-start gap-3">
      <EventMap
        class="min-w-0 flex-1 basis-80!"
        :report="report"
        :from="window.from"
        :to="window.to"
        :selected-id="eventId"
        :kind="kind"
        :team="team"
        :describe="describe"
        @select="locateEvent"
      />
      <NCard size="small" :title="t('eventsTitle')" class="min-w-0 flex-1 basis-72!">
        <NScrollbar ref="eventScroll" style="max-height: 390px">
          <div ref="eventList" class="relative flex flex-col gap-2">
            <div
              v-for="event in visibleEvents"
              :key="event.id"
              class="flex flex-wrap items-center gap-2 rounded p-2 text-xs"
              :class="
                event.id === eventId
                  ? 'bg-(--la-card-muted-surface) ring-1 ring-(--la-color-link)'
                  : ''
              "
              :data-selected-event="event.id === eventId || undefined"
            >
              <NButton
                text
                size="tiny"
                :aria-pressed="event.id === eventId"
                @click="locateEvent(event)"
                >{{ formatGameTime(event.timestamp) }}</NButton
              >
              <EventSummary
                :event="event"
                :participants="report.analysis.participants"
                :describe="describe"
              />
              <NTag v-if="junglerInvolved(event)" size="small" type="warning">{{
                tw('enemyJungler')
              }}</NTag>
            </div>
            <NEmpty v-if="!visibleEvents.length" :description="t('noEvents')" />
          </div>
        </NScrollbar>
      </NCard>
    </div>
    <ReviewChart
      :reports="[report]"
      :from="window.from"
      :to="window.to"
      :focus-window="focusWindow"
      :timestamp="timestamp"
      @seek="seek"
    />
    <NCard size="small" :title="td('title')">
      <NEmpty
        v-if="report.analysis.limitations.includes('timelineMissing')"
        :description="td('unavailable')"
      />
      <template v-else>
        <div
          v-for="group in ['kills', 'deaths'] as const"
          :key="group"
          class="mb-2 flex flex-wrap items-center gap-3"
        >
          <div class="flex items-center gap-2">
            <NIcon
              :component="group === 'kills' ? Bolt : X"
              :size="24"
              :class="
                group === 'kills'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-red-500 dark:text-red-400'
              "
              aria-hidden="true"
            /><span class="text-2xl font-semibold tabular-nums">{{ duels[group].length }}</span
            ><span class="text-xs opacity-70">{{
              tv(group === 'kills' ? 'soloKills' : 'soloDeaths')
            }}</span>
          </div>
          <NButton
            v-for="event in duels[group]"
            :key="event.id"
            size="tiny"
            @click="locateEvent(event)"
          >
            {{ formatGameTime(event.timestamp) }} ·
            <ChampionIcon
              :champion-id="
                report.analysis.participants.find(
                  (p) => p.id === (group === 'kills' ? event.victimId : event.killerId)
                )?.championId ?? -1
              "
              class="ml-1 size-6! rounded"
              role="img"
              :aria-label="champion(group === 'kills' ? event.victimId : event.killerId)"
            />
          </NButton>
        </div>
        <span class="text-xs opacity-60">{{ td('definition') }}</span>
        <div v-if="duels.unknown" class="mt-1 text-xs opacity-60">
          {{ td('unknown', { count: duels.unknown }) }}
        </div>
      </template>
    </NCard>
    <NDivider />
    <span class="font-bold">{{ t('notes') }} · {{ formatGameTime(timestamp) }}</span>
    <NInput
      v-model:value="draft"
      type="textarea"
      :maxlength="30000"
      :placeholder="t('notePlaceholder')"
      :disabled="saving"
    />
    <div class="flex gap-2">
      <FocusGoalButton :report="report" :timestamp="timestamp" :suggestion="draft.slice(0, 300)" />
      <NButton size="small" :loading="saving" :disabled="!draft.trim() || saving" @click="save">{{
        t('saveNote')
      }}</NButton>
      <NButton
        size="small"
        @click="
          router.push({
            name: NOTEBOOK_ROUTE,
            query: { champion: report.analysis.metrics.championId }
          })
        "
        >{{ t('handbook') }}</NButton
      >
    </div>
    <NAlert v-if="error" type="error">{{ t('saveFailed') }}</NAlert>
    <NCard v-for="note in notes?.items" :key="note.id" size="small">
      <template #header
        ><NButton text size="small" @click="seek(note.content.source?.timestamp ?? 0)">{{
          note.content.title
        }}</NButton></template
      >
      <div class="text-sm whitespace-pre-wrap">{{ note.content.text }}</div>
    </NCard>
    <NPagination
      v-if="notes && notes.total > 30"
      v-model:page="page"
      :page-size="30"
      :item-count="notes.total"
    />
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useEventDescription } from './useEventDescription'
import { useInstance } from '@renderer-shared/shards'
import { NOTEBOOK_ROUTE, blankContent, listSchema, type NotebookPage } from '@shared/pro/notebook'
import {
  eventWindow,
  formatGameTime,
  type ReviewEvent,
  type ReviewPoint,
  type ReviewReport
} from '@shared/pro/review'
import { useTranslation } from 'i18next-vue'
import {
  NIcon,
  NTag,
  NAlert,
  NButton,
  NCard,
  NDivider,
  NEmpty,
  NInput,
  NInputNumber,
  NPagination,
  NScrollbar,
  NSelect,
  useDialog,
  type ScrollbarInst
} from 'naive-ui'
import { computed, onScopeDispose, ref, shallowRef, watch, toRef } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import EventSummary from './EventSummary.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { Bolt, X } from '@vicons/tabler'
import ReviewChart from './ReviewChart.vue'
import EventMap from './event-map/EventMap.vue'
import ReviewTimeline from './timeline/ReviewTimeline.vue'
import { eventKind, eventKinds, eventTeam, type EventKind } from './event-map/points'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import type { ReviewFinding } from '@shared/pro/review/findings'
import { personalDuels } from '@shared/pro/review/duels'
import FocusGoalButton from '../../../shared/components/focus-goal/FocusGoalButton.vue'
const props = defineProps<{
  report: ReviewReport
  focus: number | { timestamp: number; eventId: string | null }
  focusWindow?: ReviewFinding['evidence']
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const { t: tw } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const { t: tm } = useTranslation(undefined, { keyPrefix: 'pro.eventMap' })
const { t: tv } = useTranslation(undefined, { keyPrefix: 'pro.visual' })
const { t: td } = useTranslation(undefined, { keyPrefix: 'pro.duels' })
const duels = computed(() => personalDuels(props.report.analysis))
const radius = ref<number | null>(60)
const api = useInstance(NotebookRenderer)
const router = useRouter()
const dialog = useDialog()
const seconds = ref<number | null>(0)
const eventId = ref<string | null>(null)
const eventScroll = ref<ScrollbarInst>()
const eventList = ref<HTMLElement>()
watch(
  eventId,
  () => {
    const selected = eventList.value?.querySelector<HTMLElement>('[data-selected-event="true"]')
    if (selected) eventScroll.value?.scrollTo({ top: Math.max(0, selected.offsetTop - 100) })
  },
  { flush: 'post' }
)
const timestamp = computed(() =>
  Math.min(props.report.analysis.duration, Math.max(0, Math.round((seconds.value ?? 0) * 1000)))
)
const window = computed(() =>
  eventWindow(props.report.analysis, timestamp.value, (radius.value ?? 60) * 1000)
)
const draft = ref('')
const saving = ref(false)
const error = ref(false)
const page = ref(1)
const notes = shallowRef<NotebookPage | null>(null)
let generation = 0
const enemyJungler = computed(() => {
  const players = toParticipants(props.report.summary, toBasicInfo(props.report.summary))
  const own = players.find((p) => p.participantId === props.report.analysis.participantId)
  const junglers = players.filter((p) => own && p.teamId !== own.teamId && p.position === 'JUNGLE')
  return junglers.length === 1 ? junglers[0].participantId : null
})
function junglerInvolved(event: ReviewEvent) {
  const id = enemyJungler.value
  return id !== null && (event.killerId === id || event.assistingParticipantIds?.includes(id))
}
const { describe, champion } = useEventDescription(toRef(() => props.report))
const kind = ref<EventKind>('all')
const team = ref<number | 'all'>('all')
const kindOptions = computed(() => eventKinds.map((value) => ({ value, label: tm(value) })))
const teamOptions = computed(() => [
  { value: 'all', label: tm('allTeams') },
  { value: 100, label: tm('blue') },
  { value: 200, label: tm('red') }
])
function matchesFilter(event: ReviewEvent) {
  return (
    (kind.value === 'all' ||
      eventKind(event, props.report.analysis.participantId) === kind.value) &&
    (team.value === 'all' || eventTeam(event, props.report.analysis.participants) === team.value)
  )
}
const filteredEvents = computed(() =>
  props.report.analysis.events.filter(
    (event) => eventKind(event, props.report.analysis.participantId) && matchesFilter(event)
  )
)
const visibleEvents = computed(() => window.value.events.filter(matchesFilter))
function seek(value: number) {
  seconds.value = value / 1000
  eventId.value = null
}
function locateEvent(event: ReviewEvent) {
  if (!matchesFilter(event)) {
    kind.value = 'all'
    team.value = 'all'
  }
  seconds.value = event.timestamp / 1000
  eventId.value = event.id
}
watch([kind, team], () => {
  const selected = props.report.analysis.events.find((e) => e.id === eventId.value)
  if (selected && !matchesFilter(selected)) eventId.value = null
})
function delta(key: keyof Omit<ReviewPoint, 'timestamp'>) {
  const before = window.value.before?.[key]
  const after = window.value.after?.[key]
  return before == null || after == null ? '—' : after - before
}
useQueryCache(
  () => JSON.stringify([props.report.id, page.value]),
  notes,
  () => null
)
async function loadNotes() {
  const current = ++generation
  try {
    const next = await api.list(listSchema.parse({ reportId: props.report.id, page: page.value }))
    if (current === generation) notes.value = next
  } catch {
    if (current === generation) error.value = true
  }
}
async function save() {
  if (saving.value) return
  const report = props.report
  const content = blankContent(report.analysis.metrics.championId!, 'note')
  content.title = t('noteTitle', {
    id: report.summary.gameId,
    time: formatGameTime(timestamp.value)
  })
  content.text = draft.value.trim()
  const event = report.analysis.events.find(
    (e) => e.id === eventId.value && e.timestamp === timestamp.value
  )
  content.source = {
    ...report.player,
    gameId: report.summary.gameId,
    reportId: report.id,
    timestamp: timestamp.value,
    evidenceId: event?.id
  }
  saving.value = true
  error.value = false
  try {
    await api.save({ id: null, expectedRevision: 0, content })
    if (props.report.id === report.id) {
      draft.value = ''
      page.value = 1
      await loadNotes()
    }
  } catch {
    error.value = true
  } finally {
    saving.value = false
  }
}
watch(
  [() => props.focus, () => props.focusWindow],
  ([focus, evidence]) => {
    const value = typeof focus === 'number' ? focus : focus.timestamp
    const selectedId = typeof focus === 'number' ? null : focus.eventId
    if (evidence) radius.value = Math.max(15, (evidence.to - evidence.from) / 2000)
    seconds.value = Math.min(value, props.report.analysis.duration) / 1000
    const event = props.report.analysis.events.find((event) =>
      selectedId ? event.id === selectedId : event.timestamp === value
    )
    eventId.value = null
    if (event) locateEvent(event)
  },
  { immediate: true }
)
watch(page, loadNotes, { immediate: true })
onScopeDispose(() => {
  generation++
})
function confirmLeave() {
  if (saving.value) return false
  if (!draft.value.trim()) return true
  return new Promise<boolean>((resolve) => {
    dialog.warning({
      title: t('discardTitle'),
      content: t('discardText'),
      positiveText: t('leave'),
      negativeText: t('stay'),
      onPositiveClick: () => {
        draft.value = ''
        resolve(true)
      },
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false)
    })
  })
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)
</script>
