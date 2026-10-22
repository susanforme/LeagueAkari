<template>
  <div class="review-library flex h-full min-h-0 min-w-0 flex-col">
    <header class="library-header">
      <div class="flex items-center gap-3">
        <NIcon :component="DocumentSearch24Regular" size="22" />
        <span class="text-base font-bold">{{ t('library') }}</span>
        <span class="offline-note">{{ t('offline') }}</span>
      </div>
      <NButton type="primary" @click="showGenerate = true">
        <template #icon><NIcon :component="DocumentAdd24Regular" /></template>
        {{ t('generate') }}
      </NButton>
    </header>
    <NScrollbar class="min-h-0 flex-1">
      <div class="library-content">
        <div class="library-filters">
          <label class="filter-field search-field">
            <span>{{ t('search') }}</span>
            <NInput
              v-model:value="search"
              clearable
              :maxlength="100"
              :placeholder="t('searchPlaceholder')"
              :input-props="{ 'aria-label': t('search') }"
            >
              <template #prefix><NIcon :component="Search24Regular" /></template>
            </NInput>
          </label>
          <label class="filter-field">
            <span>{{ t('queue') }}</span>
            <NSelect
              v-model:value="queueId"
              :options="queueOptions"
              clearable
              :placeholder="t('allQueues')"
              :aria-label="t('queue')"
            />
          </label>
          <label class="filter-field">
            <span>{{ t('champion') }}</span>
            <NSelect
              v-model:value="championId"
              :options="championOptions"
              filterable
              clearable
              :placeholder="t('allChampions')"
              :aria-label="t('champion')"
            />
          </label>
          <label class="filter-field date-field">
            <span>{{ t('dateRange') }}</span>
            <NDatePicker
              v-model:value="dateRange"
              type="daterange"
              clearable
              :start-placeholder="t('dateFrom')"
              :end-placeholder="t('dateTo')"
              :aria-label="t('dateRange')"
            />
          </label>
          <label class="filter-field">
            <span>{{ t('sort') }}</span>
            <NSelect v-model:value="sort" :options="sortOptions" :aria-label="t('sort')" />
          </label>
        </div>
        <div class="library-summary">
          <div class="summary-item">
            <strong>{{ facets?.saved ?? '—' }}</strong
            ><span>{{ t('savedReports') }}</span>
          </div>
          <div class="summary-item">
            <ChampionIcon
              v-if="mostReviewed"
              :champion-id="mostReviewed.championId"
              class="size-9!"
            />
            <div class="flex min-w-0 flex-col">
              <strong>{{
                mostReviewed ? resources.champions.name(mostReviewed.championId) : '—'
              }}</strong
              ><span>{{ t('mostReviewed') }}</span>
            </div>
          </div>
          <NButton
            class="summary-compare"
            secondary
            :disabled="!library?.total"
            @click="beginComparison"
          >
            <template #icon><NIcon :component="ArrowSwap24Regular" /></template>
            {{ t('selectTwo') }}
          </NButton>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span v-if="hasFilters" class="text-xs opacity-60">{{
            t('resultCount', { count: library?.total ?? 0 })
          }}</span>
          <NButton v-if="hasFilters" text size="small" @click="resetFilters">{{
            t('clearFilters')
          }}</NButton>
          <RefreshButton class="ml-auto" :disabled="loading" @click="load" />
        </div>
        <NSpin :show="loading && !library">
          <div ref="listElement" class="report-list">
            <section
              v-for="item in library?.items"
              :key="item.id"
              class="report-row"
              :class="{ selected: selected.some((report) => report.id === item.id) }"
            >
              <div class="report-toolbar">
                <NCheckbox
                  :checked="selected.some((report) => report.id === item.id)"
                  :disabled="
                    selected.length === 2 && !selected.some((report) => report.id === item.id)
                  "
                  :aria-label="t('selectForCompare', { id: item.gameId })"
                  :aria-disabled="
                    selected.length === 2 && !selected.some((report) => report.id === item.id)
                  "
                  @update:checked="toggle(item, $event)"
                >
                  <span class="text-xs">{{ item.serverId }} · #{{ item.gameId }}</span>
                </NCheckbox>
                <span class="saved-time">{{
                  t('savedAt', { time: formatDate(item.createdAt) })
                }}</span>
                <NButton size="small" @click="open(item.id)">{{ t('openReport') }}</NButton>
                <NDropdown
                  trigger="click"
                  :options="[{ label: t('deleteReport'), key: 'delete' }]"
                  @select="confirmRemove(item)"
                >
                  <NButton
                    quaternary
                    size="small"
                    :aria-label="t('moreActions', { id: item.gameId })"
                    ><template #icon><NIcon :component="MoreHorizontal24Regular" /></template
                  ></NButton>
                </NDropdown>
              </div>
              <NScrollbar x-scrollable>
                <MatchCard
                  :summary="item.summary"
                  :puuid="item.puuid"
                  :hide-privacy="app.settings.streamerMode"
                  :details="details[item.id]"
                  :loading-details="!!pending[item.id]"
                  @load-details="loadDetails(item)"
                  @navigate-to-summoner-by-puuid="
                    router.push({
                      name: 'player-tabs',
                      params: { sgpServerId: item.serverId, puuid: $event }
                    })
                  "
                />
              </NScrollbar>
            </section>
            <NEmpty
              v-if="library && !library.total"
              class="py-12"
              :description="t(hasFilters ? 'noResults' : 'empty')"
            >
              <template #extra
                ><NButton @click="hasFilters ? resetFilters() : (showGenerate = true)">{{
                  t(hasFilters ? 'clearFilters' : 'generate')
                }}</NButton></template
              >
            </NEmpty>
            <NEmpty v-if="error && !library" class="py-12" :description="t('libraryFailed')"
              ><template #extra
                ><NButton @click="load">{{ t('retry') }}</NButton></template
              ></NEmpty
            >
          </div>
        </NSpin>
        <NPagination
          v-if="library && library.total > REVIEW_PAGE_SIZE"
          v-model:page="page"
          :page-size="REVIEW_PAGE_SIZE"
          :item-count="library.total"
          :page-slot="5"
          class="self-end"
        />
      </div>
    </NScrollbar>
    <div
      v-if="selected.length"
      class="comparison-bar"
      role="region"
      :aria-label="t('compareReports')"
    >
      <span class="selection-count" aria-live="polite">{{
        t('selectionCount', { count: selected.length })
      }}</span>
      <div class="selected-reports">
        <div v-for="item in selected" :key="item.id" class="selected-report">
          <ChampionIcon :champion-id="item.championId" class="size-8!" />
          <div class="min-w-0">
            <div class="truncate">
              {{ resources.champions.name(item.championId) }} · #{{ item.gameId }}
            </div>
            <div class="text-xs opacity-60">{{ formatDate(item.startedAt) }}</div>
          </div>
          <NButton
            quaternary
            circle
            size="small"
            :aria-label="t('removeSelection', { id: item.gameId })"
            @click="toggle(item, false)"
            ><template #icon><NIcon :component="Dismiss24Regular" /></template
          ></NButton>
        </div>
      </div>
      <div class="comparison-actions">
        <NButton quaternary @click="selected = []">{{ t('clearSelection') }}</NButton>
        <NButton type="primary" :disabled="selected.length !== 2" @click="compareSelected"
          ><template #icon><NIcon :component="ArrowSwap24Regular" /></template
          >{{ t('compareReports') }}</NButton
        >
      </div>
    </div>
    <GenerateReportDialog v-model:show="showGenerate" />
  </div>
</template>

<script setup lang="ts">
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import type { LcuOrSgpGameDetails } from '@shared/data-adapter/wrapper'
import {
  REVIEW_PAGE_SIZE,
  REVIEW_ROUTE,
  type ReviewLibrary,
  type ReviewListItem,
  type ReviewListQuery
} from '@shared/pro/review'
import {
  ArrowSwap24Regular,
  Dismiss24Regular,
  DocumentAdd24Regular,
  DocumentSearch24Regular,
  MoreHorizontal24Regular,
  Search24Regular
} from '@vicons/fluent'
import { useDebounceFn } from '@vueuse/core'
import { useTranslation } from 'i18next-vue'
import {
  NButton,
  NCheckbox,
  NDatePicker,
  NDropdown,
  NEmpty,
  NIcon,
  NInput,
  NPagination,
  NScrollbar,
  NSelect,
  NSpin,
  useDialog,
  useNotification
} from 'naive-ui'
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { z } from 'zod'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import { useQueryCache } from '../../../shared/composables/query-cache'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'
import { ReviewRenderer } from '../../../shared/shards/review'
import GenerateReportDialog from './GenerateReportDialog.vue'

const props = defineProps<{
  visible: boolean
  champions: { id: number; name: string; keywords: string }[]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const api = useInstance(ReviewRenderer),
  resources = useGameResourceProvider(),
  app = useAppCommonStore(),
  router = useRouter(),
  dialog = useDialog(),
  notification = useNotification()
const library = shallowRef<ReviewLibrary | null>(null),
  selected = shallowRef<ReviewListItem[]>([])
const search = ref(''),
  debouncedSearch = ref(''),
  championId = ref<number | null>(null),
  queueId = ref<number | null>(null),
  dateRange = ref<[number, number] | null>(null),
  sort = ref<ReviewListQuery['sort']>('matchNewest'),
  page = ref(1)
const loading = ref(false),
  error = ref(false),
  showGenerate = ref(false),
  listElement = ref<HTMLElement>()
const details = shallowRef<Record<string, LcuOrSgpGameDetails | null>>({}),
  pending = ref<Record<string, boolean>>({})
const facets = shallowRef<Pick<ReviewLibrary, 'saved' | 'champions' | 'queueIds'> | null>(null)
const mostReviewed = computed(() => facets.value?.champions[0])
const championOptions = computed(() =>
  (facets.value?.champions ?? []).map((item) => ({
    value: item.championId,
    label: resources.champions.name(item.championId)
  }))
)
const queueOptions = computed(() =>
  (facets.value?.queueIds ?? []).map((id) => ({ value: id, label: resources.queues.name(id) }))
)
const sortOptions = computed(() =>
  ['matchNewest', 'matchOldest', 'savedNewest', 'savedOldest'].map((value) => ({
    value,
    label: t(value)
  }))
)
const hasFilters = computed(
  () => !!(search.value || championId.value !== null || queueId.value !== null || dateRange.value)
)
const query = computed<ReviewListQuery>(() => {
  const end = dateRange.value ? new Date(dateRange.value[1]) : null
  end?.setDate(end.getDate() + 1)
  return {
    page: page.value,
    search: debouncedSearch.value.trim(),
    searchChampionIds: !debouncedSearch.value.trim()
      ? []
      : props.champions
          .filter((item) =>
            `${item.name} ${item.keywords}`
              .toLowerCase()
              .includes(debouncedSearch.value.trim().toLowerCase())
          )
          .map((item) => item.id),
    championId: championId.value,
    queueId: queueId.value,
    from: dateRange.value?.[0] ?? null,
    to: end?.getTime() ?? null,
    sort: sort.value
  }
})
const cache = useQueryCache(
  () => JSON.stringify(query.value),
  library,
  () => null
)
let active = true,
  generation = 0
const formatDate = (value: number) =>
  new Date(value).toLocaleString(resources.runtime.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
function resetFilters() {
  search.value = ''
  debouncedSearch.value = ''
  championId.value = null
  queueId.value = null
  dateRange.value = null
}
function toggle(item: ReviewListItem, checked: boolean) {
  if (!checked) selected.value = selected.value.filter((report) => report.id !== item.id)
  else if (selected.value.length < 2 && !selected.value.some((report) => report.id === item.id))
    selected.value = [...selected.value, item]
}
function beginComparison() {
  listElement.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  listElement.value?.querySelector<HTMLElement>('[role="checkbox"]')?.focus({ preventScroll: true })
}
function open(id: string) {
  void router.push({ name: REVIEW_ROUTE, query: { id } })
}
function compareSelected() {
  if (selected.value.length === 2)
    void router.push({
      name: REVIEW_ROUTE,
      query: { id: selected.value[0].id, compare: selected.value[1].id }
    })
}
async function load() {
  if (!active || !props.visible) return
  const current = ++generation
  loading.value = true
  error.value = false
  try {
    const next = await api.list(query.value)
    if (current !== generation) return
    const last = Math.max(1, Math.ceil(next.total / REVIEW_PAGE_SIZE))
    if (page.value > last) {
      page.value = last
      return
    }
    library.value = next
    facets.value = next
  } catch {
    if (current === generation) {
      error.value = true
      notification.error({ title: t('libraryFailed'), duration: 4000 })
    }
  } finally {
    if (current === generation) loading.value = false
  }
}
async function loadDetails(item: ReviewListItem) {
  if (pending.value[item.id] || item.id in details.value) return
  pending.value[item.id] = true
  try {
    const report = await api.get(item.id)
    details.value = { ...details.value, [item.id]: report.details }
  } catch {
    notification.error({ title: t('libraryFailed'), duration: 4000 })
  } finally {
    pending.value[item.id] = false
  }
}
function confirmRemove(item: ReviewListItem) {
  dialog.warning({
    title: t('deleteReport'),
    content: t('deleteConfirm', {
      champion: resources.champions.name(item.championId),
      id: item.gameId
    }),
    positiveText: t('deleteReport'),
    negativeText: t('cancel'),
    onPositiveClick: async () => {
      try {
        const result = await api.remove(item.id)
        if (result === 'referenced') {
          notification.warning({ title: t('reportReferenced'), duration: 6000 })
          return false
        }
        toggle(item, false)
        cache.clear()
        if (library.value)
          library.value = {
            ...library.value,
            items: library.value.items.filter((report) => report.id !== item.id),
            total: Math.max(0, library.value.total - 1),
            saved: Math.max(0, library.value.saved - 1)
          }
        await load()
        return true
      } catch {
        notification.error({ title: t('deleteFailed'), duration: 4000 })
        return false
      }
    }
  })
}
watch(
  search,
  useDebounceFn(() => {
    debouncedSearch.value = search.value
  }, 250)
)
watch(
  [debouncedSearch, championId, queueId, dateRange, sort],
  () => {
    page.value = 1
  },
  { flush: 'sync' }
)
watch(query, load)
watch(
  () => props.visible,
  (visible) => {
    if (visible) void load()
    else {
      generation++
      showGenerate.value = false
    }
  }
)
onActivated(() => {
  active = true
  void load()
})
onDeactivated(() => {
  active = false
  generation++
  showGenerate.value = false
})
onScopeDispose(() => {
  active = false
  generation++
})
useWorkspaceState(
  'pro-review',
  { search, championId, queueId, dateRange, sort, page },
  z.object({
    search: z.string().max(100).default(''),
    championId: z.number().nullable().default(null),
    queueId: z.number().nullable().default(null),
    dateRange: z.tuple([z.number(), z.number()]).nullable().default(null),
    sort: z
      .enum(['matchNewest', 'matchOldest', 'savedNewest', 'savedOldest'])
      .default('matchNewest'),
    page: z.number().int().positive().default(1)
  })
)
</script>

<style scoped>
.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--la-color-popover-border);
}
.offline-note,
.saved-time,
.filter-field > span,
.summary-item span {
  font-size: 12px;
  color: color-mix(in srgb, var(--la-color-text-primary) 60%, transparent);
}
.library-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 24px;
}
.library-filters {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.3fr) repeat(2, minmax(120px, 1fr)) minmax(240px, 1.5fr)
    minmax(150px, 1fr);
  gap: 12px;
}
.filter-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
}
.library-summary {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.summary-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--la-color-popover-border);
  border-radius: 8px;
  background: var(--la-card-surface-90);
}
.summary-item strong {
  font-size: 20px;
  font-weight: 600;
}
.summary-compare {
  height: auto;
  min-height: 68px;
}
.report-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.report-row {
  min-width: 0;
  border: 1px solid var(--la-color-popover-border);
  border-radius: 8px;
  padding: 10px;
}
.report-row.selected {
  border-color: var(--la-color-link);
  background: color-mix(in srgb, var(--la-color-link) 5%, transparent);
}
.report-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
.saved-time {
  margin-left: auto;
}
.comparison-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 24px;
  border-top: 1px solid var(--la-color-popover-border);
  background: var(--la-color-bg-primary);
  box-shadow: 0 -4px 20px #0000000d;
}
.comparison-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.selection-count {
  font-size: 13px;
  font-weight: 600;
}
.selected-reports {
  display: flex;
  flex: 1;
  gap: 10px;
  min-width: 0;
}
.selected-report {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--la-card-surface-90);
  font-size: 12px;
}
@media (max-width: 1250px) {
  .library-filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .search-field {
    grid-column: span 2;
  }
  .date-field {
    grid-column: span 1;
  }
  .selected-reports {
    flex-basis: 70%;
  }
}
@media (max-width: 850px) {
  .library-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .date-field {
    grid-column: span 2;
  }
  .library-summary {
    grid-template-columns: 1fr 1fr;
  }
  .summary-compare {
    grid-column: span 2;
    min-height: 36px;
  }
  .library-content {
    padding: 16px;
  }
  .comparison-bar {
    padding: 12px 16px;
  }
  .selected-reports {
    flex-basis: 100%;
  }
}
</style>
