<template>
  <div class="review-page flex h-full min-w-0 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="DocumentSearch24Regular" size="22" />
      <span class="text-base font-bold">{{ t('title') }}</span>
      <MatchShare v-if="report" :summary="report.summary" :puuid="report.player.puuid" />
      <NButton v-if="report" size="small" @click="router.push({ name: REVIEW_ROUTE })">{{
        t('library')
      }}</NButton>
      <NButton v-if="report && !comparison" size="small" :loading="loading" @click="refresh">{{
        t('refresh')
      }}</NButton>
    </div>
    <NScrollbar class="min-h-0 flex-1">
      <div class="flex flex-col gap-4 p-6">
        <NAlert v-if="error" type="error"
          >{{ t('loadFailed') }} <NButton text @click="load">{{ t('retry') }}</NButton></NAlert
        >
        <NSpin :show="loading">
          <template v-if="report">
            <ReviewFindings
              v-if="!comparison"
              :report="report"
              :insights="baseline"
              @locate="locateFinding"
              @compare="compareBaseline"
            />
            <NAlert v-if="comparison" type="info" class="mb-3">{{ t('compareHelp') }}</NAlert>
            <NAlert v-if="incomparable" type="warning" class="mb-3">{{
              t('differentContext')
            }}</NAlert>
            <div class="grid gap-4" :class="comparison ? 'grid-cols-2' : 'grid-cols-1'">
              <ReviewOverview :report="report" @locate="locateCheckpoint" />
              <ReviewOverview
                v-if="comparison"
                :report="comparison"
                @locate="compareFocus = $event"
              />
            </div>
            <NCard v-if="comparison" size="small" class="mt-4" :title="t('compare')">
              <ReviewChart :reports="[report, comparison]" />
            </NCard>
            <PersonalBaseline
              v-if="!comparison"
              :key="report.id"
              :report="report"
              @baseline="setBaseline"
            />
            <div ref="evidenceSection">
              <NTabs v-model:value="tab" type="line" class="mt-4">
                <NTabPane name="events" :tab="t('eventsTitle')" display-directive="show">
                  <div class="grid gap-5" :class="comparison ? 'grid-cols-2' : 'grid-cols-1'">
                    <EventReview
                      :key="report.id"
                      :report="report"
                      :focus="focus"
                      :focus-window="focusWindow"
                    />
                    <EventReview
                      v-if="comparison"
                      :key="comparison.id"
                      :report="comparison"
                      :focus="compareFocus"
                    />
                  </div>
                </NTabPane>
                <NTabPane name="details" :tab="t('matchDetails')">
                  <NScrollbar x-scrollable>
                    <MatchCard
                      :summary="report.summary"
                      :details="report.details ?? undefined"
                      :puuid="report.player.puuid"
                      :hide-privacy="app.settings.streamerMode"
                    />
                    <MatchCard
                      v-if="comparison"
                      :summary="comparison.summary"
                      :details="comparison.details ?? undefined"
                      :puuid="comparison.player.puuid"
                      :hide-privacy="app.settings.streamerMode"
                    />
                  </NScrollbar>
                </NTabPane>
              </NTabs>
            </div>
          </template>
          <template v-else>
            <NAlert type="info" class="mb-4">{{ t('libraryHelp') }}</NAlert>
            <div class="mb-3 flex items-center justify-between gap-3">
              <NButton size="small" :disabled="selected.length !== 2" @click="compareSelected">{{
                t('compareSelected', { count: selected.length })
              }}</NButton>
              <NPagination v-model:page="page" :page-size="30" :item-count="library?.total ?? 0" />
            </div>
            <div class="flex flex-col gap-2">
              <NCard v-for="item in library?.items" :key="item.id" size="small">
                <div class="flex items-center gap-3">
                  <NCheckbox
                    :checked="selected.includes(item.id)"
                    :disabled="selected.length === 2 && !selected.includes(item.id)"
                    :aria-label="t('selectForCompare', { id: item.gameId })"
                    @update:checked="toggle(item.id, $event)"
                  />
                  <ChampionIcon :champion-id="item.championId" class="size-9!" />
                  <NButton text @click="router.push({ name: REVIEW_ROUTE, query: { id: item.id } })"
                    >{{ resources.champions.name(item.championId) }} · {{ item.gameId }}</NButton
                  >
                  <span class="text-xs opacity-60"
                    >{{ item.serverId }} · {{ new Date(item.startedAt).toLocaleString() }}</span
                  >
                  <span class="ml-auto text-xs opacity-60">{{
                    t('savedAt', { time: new Date(item.createdAt).toLocaleString() })
                  }}</span>
                </div>
              </NCard>
              <NEmpty v-if="library && !library.total" :description="t('empty')" />
            </div>
          </template>
        </NSpin>
      </div>
    </NScrollbar>
  </div>
</template>
<script setup lang="ts">
import MatchShare from '../../../shared/components/share-card/MatchShare.vue'
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import {
  REVIEW_ROUTE,
  reviewRequestSchema,
  type ReviewListItem,
  type ReviewReport
} from '@shared/pro/review'
import { DocumentSearch24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NEmpty,
  NIcon,
  NPagination,
  NScrollbar,
  NSpin,
  NTabPane,
  NTabs
} from 'naive-ui'
import { computed, nextTick, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ReviewRenderer } from '../../../shared/shards/review'
import { useNotebookResources } from '../notebook/useNotebookResources'
import EventReview from './EventReview.vue'
import ReviewChart from './ReviewChart.vue'
import ReviewOverview from './ReviewOverview.vue'
import PersonalBaseline from '../progress/PersonalBaseline.vue'
import type { Insights } from '@shared/pro/progress'
import type { ReviewFinding } from '@shared/pro/review/findings'
import ReviewFindings from './ReviewFindings.vue'
import { z } from 'zod'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const api = useInstance(ReviewRenderer)
const app = useAppCommonStore()
const route = useRoute()
const router = useRouter()
const report = shallowRef<ReviewReport | null>(null)
const comparison = shallowRef<ReviewReport | null>(null)
const { resources } = useNotebookResources(
  computed(() => report.value?.analysis.metrics.championId ?? null)
)
const library = shallowRef<{ items: ReviewListItem[]; total: number } | null>(null)
const page = ref(1)
const selected = ref<string[]>([])
const loading = ref(false)
const error = ref(false)
const focus = ref(0)
const compareFocus = ref(0)
const baseline = shallowRef<Insights | null>(null)
const focusWindow = shallowRef<ReviewFinding['evidence']>()
const tab = ref<'events' | 'details'>('events')
const evidenceSection = ref<HTMLElement>()
function setBaseline(reportId: string, value: Insights | null) {
  if (report.value?.id === reportId) baseline.value = value
}
async function locateFinding(evidence: NonNullable<ReviewFinding['evidence']>) {
  focusWindow.value = { ...evidence }
  focus.value = (evidence.from + evidence.to) / 2
  tab.value = 'events'
  await nextTick()
  evidenceSection.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
function locateCheckpoint(timestamp: number) {
  focusWindow.value = undefined
  focus.value = timestamp
  tab.value = 'events'
}
function compareBaseline(id: string, timestamp?: number) {
  if (report.value)
    void router.push({
      name: REVIEW_ROUTE,
      query: { id: report.value.id, compare: id, time: timestamp }
    })
}
let generation = 0
let active = false
const incomparable = computed(() => {
  const a = report.value,
    b = comparison.value
  return (
    a &&
    b &&
    (a.player.puuid !== b.player.puuid ||
      a.player.serverId !== b.player.serverId ||
      a.analysis.version !== b.analysis.version ||
      ['queueId', 'patch', 'position', 'championId'].some(
        (key) =>
          a.analysis.metrics[key as keyof typeof a.analysis.metrics] !==
          b.analysis.metrics[key as keyof typeof b.analysis.metrics]
      ))
  )
})
function toggle(id: string, checked: boolean) {
  selected.value = checked
    ? [...selected.value, id].slice(0, 2)
    : selected.value.filter((value) => value !== id)
}
function compareSelected() {
  void router.push({
    name: REVIEW_ROUTE,
    query: { id: selected.value[0], compare: selected.value[1] }
  })
}
let loadedContext = ''
async function load() {
  if (!active || route.name !== REVIEW_ROUTE) return
  const current = ++generation
  loading.value = true
  error.value = false
  const context = JSON.stringify(route.query)
  if (context !== loadedContext) {
    report.value = null
    comparison.value = null
    baseline.value = null
    focusWindow.value = undefined
    loadedContext = context
  }
  try {
    const query = { ...route.query }
    if (query.id || query.gameId) {
      const next =
        typeof query.id === 'string'
          ? await api.get(query.id)
          : await api.open(reviewRequestSchema.parse({ ...query, gameId: Number(query.gameId) }))
      const second = typeof query.compare === 'string' ? await api.get(query.compare) : null
      if (current === generation) {
        report.value = next
        comparison.value = second
        const firstDeath = (value: ReviewReport) =>
          value.analysis.events.find(
            (event) =>
              event.type === 'CHAMPION_KILL' && event.victimId === value.analysis.participantId
          )?.timestamp ?? 0
        focus.value =
          query.time === undefined
            ? firstDeath(next)
            : Math.max(0, Math.min(next.analysis.duration, Number(query.time) || 0))
        compareFocus.value = second
          ? query.time === undefined
            ? firstDeath(second)
            : Math.max(0, Math.min(second.analysis.duration, Number(query.time) || 0))
          : 0
      }
    } else {
      const next = await api.list(page.value)
      if (current === generation) library.value = next
    }
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
async function refresh() {
  if (!report.value || loading.value) return
  const current = ++generation
  loading.value = true
  error.value = false
  try {
    const next = await api.open({
      ...report.value.player,
      gameId: report.value.summary.gameId,
      refresh: true
    })
    if (current === generation) {
      if (next.id !== report.value?.id)
        await router.replace({ name: REVIEW_ROUTE, query: { id: next.id } })
    }
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch([() => route.query, page], load)
onActivated(() => {
  active = true
  void load()
})
onDeactivated(() => {
  active = false
  generation++
})
useWorkspaceState(
  'pro-review',
  { page, tab },
  z.object({ page: z.number().int().positive(), tab: z.enum(['events', 'details']) })
)
</script>
