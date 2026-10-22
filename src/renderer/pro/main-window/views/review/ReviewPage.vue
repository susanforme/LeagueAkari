<template>
  <div class="review-page flex h-full min-w-0 flex-col">
    <ReviewLibrary v-show="!isReport" :visible="!isReport" :champions="champions" />
    <div
      v-if="isReport"
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="DocumentSearch24Regular" size="22" />
      <span class="text-base font-bold">{{ t('title') }}</span>
      <MatchShare v-if="report" :summary="report.summary" :puuid="report.player.puuid" />
      <NButton v-if="report" size="small" @click="router.push({ name: REVIEW_ROUTE })">{{
        t('library')
      }}</NButton>
      <RefreshButton v-if="report && !comparison" @click="refresh" />
    </div>
    <NScrollbar v-if="isReport" class="min-h-0 flex-1">
      <div class="flex flex-col gap-4 p-6">
        <NSpin :show="loading && !report">
          <template v-if="report">
            <NAlert v-if="comparison" type="info" class="mb-3">{{ t('compareHelp') }}</NAlert>
            <NAlert v-if="incomparable" type="warning" class="mb-3">{{
              t('differentContext')
            }}</NAlert>
            <div
              class="grid gap-4"
              :class="comparison ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'"
            >
              <ReviewOverview :key="report.id" :report="report" />
              <ReviewOverview v-if="comparison" :key="comparison.id" :report="comparison" />
            </div>
            <NCard v-if="comparison" size="small" class="mt-4" :title="t('compare')">
              <ReviewChart :reports="[report, comparison]" />
            </NCard>
            <KeyMoments
              v-if="!comparison"
              :key="`moments:${report.id}`"
              class="mt-4"
              :report="report"
              @locate="locateCheckpoint"
            />
            <ReviewFindings
              class="mt-4"
              v-if="!comparison"
              :report="report"
              :insights="baseline"
              @locate="locateFinding"
              @compare="compareBaseline"
            />
            <PersonalBaseline
              v-if="!comparison"
              :key="report.id"
              :report="report"
              class="mt-4"
              @baseline="setBaseline"
            />
            <div
              class="mt-4 grid gap-4"
              :class="comparison ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'"
            >
              <ReviewDetails :key="report.id" :report="report" @locate="locateCheckpoint" />
              <ReviewDetails
                v-if="comparison"
                :key="comparison.id"
                :report="comparison"
                @locate="locateComparison"
              />
            </div>
            <div ref="evidenceSection">
              <NTabs v-model:value="tab" type="line" class="mt-4">
                <NTabPane name="events" :tab="t('eventsTitle')" display-directive="show">
                  <div
                    class="grid gap-5"
                    :class="comparison ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'"
                  >
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
        </NSpin>
      </div>
    </NScrollbar>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import MatchShare from '../../../shared/components/share-card/MatchShare.vue'
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { REVIEW_ROUTE, reviewRequestSchema, type ReviewReport } from '@shared/pro/review'
import { DocumentSearch24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NCard, NIcon, NScrollbar, NSpin, NTabPane, NTabs } from 'naive-ui'
import { computed, nextTick, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ReviewRenderer } from '../../../shared/shards/review'
import { useNotebookResources } from '../notebook/useNotebookResources'
import EventReview from './EventReview.vue'
import ReviewChart from './ReviewChart.vue'
import ReviewOverview from './ReviewOverview.vue'
import ReviewDetails from './ReviewDetails.vue'
import KeyMoments from './KeyMoments.vue'
import PersonalBaseline from '../progress/PersonalBaseline.vue'
import type { Insights } from '@shared/pro/progress'
import type { ReviewFinding } from '@shared/pro/review/findings'
import ReviewFindings from './ReviewFindings.vue'
import ReviewLibrary from './ReviewLibrary.vue'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const api = useInstance(ReviewRenderer)
const app = useAppCommonStore()
const route = useRoute()
const router = useRouter()
const report = shallowRef<ReviewReport | null>(null)
const comparison = shallowRef<ReviewReport | null>(null)
const { champions } = useNotebookResources(
  computed(() => report.value?.analysis.metrics.championId ?? null)
)
const loading = ref(false)
const error = ref(false)
const focus = ref<number | { timestamp: number; eventId: string | null }>(0)
const compareFocus = ref<typeof focus.value>(0)
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
async function locateCheckpoint(timestamp: number, eventId: string | null = null) {
  focusWindow.value = undefined
  focus.value = { timestamp, eventId }
  tab.value = 'events'
  await nextTick()
  evidenceSection.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
async function locateComparison(timestamp: number) {
  compareFocus.value = { timestamp, eventId: null }
  tab.value = 'events'
  await nextTick()
  evidenceSection.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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
const isReport = computed(() => !!(route.query.id || route.query.gameId))
let loadedContext = ''
const contextKey = () =>
  route.name === REVIEW_ROUTE
    ? JSON.stringify([
        route.query.id,
        route.query.serverId,
        route.query.puuid,
        route.query.gameId,
        route.query.compare
      ])
    : loadedContext
const reportCache = useQueryCache(contextKey, report, () => null)
useQueryCache(contextKey, comparison, () => null)
useQueryCache(contextKey, baseline, () => null)
async function load() {
  if (!active || route.name !== REVIEW_ROUTE) return
  const current = ++generation
  loading.value = true
  error.value = false
  const context = contextKey()
  const changed = context !== loadedContext
  if (changed) {
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
        if (changed || route.query.time !== undefined) {
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
      }
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
      if (next.id !== report.value?.id) {
        reportCache.set(JSON.stringify([next.id, undefined, undefined, undefined, undefined]), next)
        await router.replace({ name: REVIEW_ROUTE, query: { id: next.id } })
      } else report.value = next
    }
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(() => route.query, load)
onActivated(() => {
  active = true
  void load()
})
onDeactivated(() => {
  active = false
  generation++
})
useRefreshFeedback(
  () => error.value,
  () => t('loadFailed')
)
</script>
