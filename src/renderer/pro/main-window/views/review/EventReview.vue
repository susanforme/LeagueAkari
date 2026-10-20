<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3">
      <NSelect
        v-model:value="eventId"
        class="min-w-60 flex-1"
        clearable
        :options="eventOptions"
        :placeholder="t('selectEvent')"
        @update:value="selectEvent"
      />
      <NInputNumber
        v-model:value="seconds"
        :min="0"
        :max="Math.floor(report.analysis.duration / 1000)"
        :precision="3"
        :aria-label="t('timeSeconds')"
        class="w-40!"
      />
      <span class="text-xs">{{ t('timeSeconds') }}</span>
    </div>
    <div class="flex items-center gap-2">
      <span>{{ tw('windowSeconds') }}</span
      ><NInputNumber
        v-model:value="radius"
        :min="15"
        :max="600"
        class="w-32!"
        :aria-label="tw('windowSeconds')"
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
    <ReviewChart
      :reports="[report]"
      :from="window.from"
      :to="window.to"
      :focus-window="focusWindow"
    />
    <NScrollbar style="max-height: 240px">
      <div class="flex flex-col gap-2">
        <div
          v-for="event in window.events"
          :key="event.id"
          class="flex flex-wrap items-center gap-2 text-xs"
        >
          <NButton text size="tiny" @click="locateEvent(event)">{{
            formatGameTime(event.timestamp)
          }}</NButton>
          <span>{{ describe(event) }}</span
          ><NTag v-if="junglerInvolved(event)" size="small" type="warning">{{
            tw('enemyJungler')
          }}</NTag>
          <span v-if="event.position" class="opacity-60"
            >({{ event.position.x }}, {{ event.position.y }})</span
          >
          <span class="opacity-60">{{ t('evidence') }} {{ event.id }}</span>
        </div>
        <NEmpty v-if="!window.events.length" :description="t('noEvents')" />
      </div>
    </NScrollbar>
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
        ><NButton
          text
          size="small"
          @click="seconds = (note.content.source?.timestamp ?? 0) / 1000"
          >{{ note.content.title }}</NButton
        ></template
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
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
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
  useDialog
} from 'naive-ui'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import ReviewChart from './ReviewChart.vue'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import type { ReviewFinding } from '@shared/pro/review/findings'
const props = defineProps<{
  report: ReviewReport
  focus: number
  focusWindow?: ReviewFinding['evidence']
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const { t: tw } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const radius = ref<number | null>(60)
const api = useInstance(NotebookRenderer)
const resources = useGameResourceProvider()
const router = useRouter()
const dialog = useDialog()
const seconds = ref<number | null>(0)
const eventId = ref<string | null>(null)
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
function champion(id?: number) {
  const player = props.report.analysis.participants.find((p) => p.id === id)
  return player ? resources.champions.name(player.championId) : t('unknown')
}
function describe(event: ReviewEvent) {
  if (event.type === 'CHAMPION_KILL')
    return t('killEvent', { killer: champion(event.killerId), victim: champion(event.victimId) })
  if (event.type === 'ELITE_MONSTER_KILL')
    return `${champion(event.killerId)} · ${t(`objectives.${event.monsterType}`, { defaultValue: event.monsterType ?? t('unknown') })}${event.monsterSubType ? ` (${event.monsterSubType})` : ''}`
  if (event.type === 'BUILDING_KILL')
    return `${champion(event.killerId)} · ${t('building')} · ${event.laneType ?? ''} · ${event.buildingType ?? ''}`
  return `${champion(event.participantId)} · ${t(`events.${event.type}`, { defaultValue: event.type })} · ${resources.items.display(event.itemId ?? 0)?.name ?? event.itemId ?? ''}`
}
const eventOptions = computed(() =>
  props.report.analysis.events
    .filter((event) =>
      event.type === 'CHAMPION_KILL'
        ? event.victimId === props.report.analysis.participantId
        : event.type === 'ELITE_MONSTER_KILL' || event.type === 'BUILDING_KILL'
    )
    .map((event) => ({
      value: event.id,
      label: `${formatGameTime(event.timestamp)} · ${describe(event)}`
    }))
)
function locateEvent(event: ReviewEvent) {
  seconds.value = event.timestamp / 1000
  eventId.value = eventOptions.value.some((option) => option.value === event.id) ? event.id : null
}
function selectEvent(id: string | null) {
  const event = props.report.analysis.events.find((e) => e.id === id)
  if (event) locateEvent(event)
}
function delta(key: keyof Omit<ReviewPoint, 'timestamp'>) {
  const before = window.value.before?.[key]
  const after = window.value.after?.[key]
  return before == null || after == null ? '—' : after - before
}
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
  ([value, evidence]) => {
    if (evidence) radius.value = Math.max(15, (evidence.to - evidence.from) / 2000)
    seconds.value = Math.min(value, props.report.analysis.duration) / 1000
    const event = props.report.analysis.events.find((event) => event.timestamp === value)
    eventId.value =
      event && eventOptions.value.some((option) => option.value === event.id) ? event.id : null
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
