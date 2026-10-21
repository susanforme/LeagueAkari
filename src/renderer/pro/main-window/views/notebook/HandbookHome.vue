<template>
  <div class="handbook-home">
    <header class="home-heading">
      <div>
        <h1>{{ t('title') }}</h1>
        <p>{{ t('subtitle') }}</p>
      </div>
      <RefreshButton @click="refresh" />
    </header>

    <NSpin :show="loading && !home">
      <div class="home-layout">
        <main class="home-main">
          <div class="summary-grid">
            <NButton class="summary-card surface" :bordered="false" @click="reset"
              ><NIcon class="summary-symbol" :component="BookOpen24Regular" /><span
                ><strong>{{ owned.length }}</strong
                ><span>{{ t('champions') }}</span
                ><small>{{ t('withContent') }}</small></span
              ></NButton
            >
            <NButton class="summary-card surface" :bordered="false" @click="showEntries(false)"
              ><NIcon class="summary-symbol" :component="Document24Regular" /><span
                ><strong>{{ total }}</strong
                ><span>{{ t('entries') }}</span
                ><small>{{ t('allContent') }}</small></span
              ></NButton
            >
            <NButton class="summary-card surface" :bordered="false" @click="emit('practice', null)"
              ><NIcon class="summary-symbol mint" :component="TargetArrow24Regular" /><span
                ><strong>{{
                  (home?.practice.pending ?? 0) +
                  (home?.practice.practicing ?? 0) +
                  (home?.practice.paused ?? 0)
                }}</strong
                ><span>{{ t('tasks') }}</span
                ><small
                  >{{ tw('states.practicing') }} {{ home?.practice.practicing ?? 0 }} ·
                  {{ tw('states.pending') }} {{ home?.practice.pending ?? 0 }}</small
                ></span
              ></NButton
            >
            <NButton class="summary-card surface" :bordered="false" @click="showEntries(true)"
              ><NIcon class="summary-symbol" :component="Clock24Regular" /><span
                ><strong>{{ home?.updated ?? 0 }}</strong
                ><span>{{ t('updated') }}</span
                ><small>{{ t('lastWeek') }}</small></span
              ></NButton
            >
          </div>
          <section>
            <div class="section-title">
              <h2>{{ t('myChampions') }}</h2>
              <NCheckbox v-model:checked="favoritesOnly">{{ t('favorites') }}</NCheckbox>
            </div>
            <div class="filters">
              <NSelect
                v-model:value="position"
                clearable
                :options="positionOptions"
                :placeholder="t('allPositions')"
                :aria-label="t('allPositions')"
              />
              <NSelect
                v-model:value="contentKind"
                clearable
                :options="kindOptions"
                :placeholder="tn('allKinds')"
                :aria-label="tn('allKinds')"
              />
              <NInput
                v-model:value="search"
                clearable
                :maxlength="200"
                :placeholder="t('search')"
                :aria-label="t('search')"
              />
              <NSelect v-model:value="sort" :options="sortOptions" :aria-label="tn('sort')" />
            </div>
            <div class="champion-grid">
              <article
                v-for="champion in visibleChampions"
                :key="champion.championId"
                class="hero-card surface"
              >
                <NButton
                  class="favorite"
                  size="tiny"
                  quaternary
                  :type="champion.favorite ? 'warning' : 'default'"
                  :disabled="favoriteBusy === champion.championId"
                  :aria-label="
                    t(champion.favorite ? 'unfavorite' : 'favorite', {
                      name: name(champion.championId)
                    })
                  "
                  :aria-pressed="champion.favorite"
                  @click="favorite(champion)"
                  ><NIcon :size="19" :component="champion.favorite ? Star24Filled : Star24Regular"
                /></NButton>
                <NButton
                  text
                  class="hero-open"
                  :title="tn('updated', { date: date(champion.updatedAt) })"
                  @click="emit('select', champion.championId)"
                >
                  <ChampionIcon :champion-id="champion.championId" class="hero-icon" />
                  <span class="hero-identity">
                    <strong>{{ name(champion.championId) }}</strong>
                    <span class="roles">
                      <NTag
                        v-for="role in champion.positions"
                        :key="role"
                        size="small"
                        :bordered="false"
                        >{{ tn(`positions.${role}`) }}</NTag
                      >
                      <span v-if="!champion.positions.length" class="muted">{{
                        t('noPosition')
                      }}</span>
                    </span>
                  </span>
                </NButton>
                <div class="content-counts">
                  <NTooltip v-for="kind in kinds" :key="kind" trigger="hover">
                    <template #trigger>
                      <NButton
                        class="content-count"
                        :bordered="false"
                        :style="{ '--kind-color': colors[kind] }"
                        :aria-label="`${t(`kinds.${kind}`)}: ${champion[kind]}`"
                        @click="emit('select', champion.championId, kind)"
                      >
                        <NIcon :component="kindIcons[kind]" :size="22" />
                        <span>{{ champion[kind] }}</span>
                      </NButton>
                    </template>
                    {{ t(`kinds.${kind}`) }} · {{ tn('entryCount', { count: champion[kind] }) }}
                  </NTooltip>
                </div>
              </article>
            </div>
            <NEmpty
              v-if="home && !visibleChampions.length"
              :description="owned.length ? tn('noChampions') : t('empty')"
              ><template #extra
                ><NButton @click="owned.length ? reset() : emit('browse', true)">{{
                  owned.length ? tn('clearFilters') : t('add')
                }}</NButton></template
              ></NEmpty
            >
          </section>
          <section ref="activitySection" class="activity surface">
            <div class="section-title">
              <h2>{{ search ? t('searchResults') : t('recent') }}</h2>
              <NButton v-if="recentOnly" size="tiny" @click="recentOnly = false">{{
                tn('clearFilters')
              }}</NButton
              ><NButton text size="small" @click="expanded = !expanded"
                >{{ t(expanded ? 'collapse' : 'viewAll') }} · {{ entries?.total ?? 0 }}</NButton
              >
            </div>
            <div class="activity-tabs">
              <NButton
                v-for="value in [null, ...kinds]"
                :key="value ?? 'all'"
                size="small"
                :type="activityKind === value ? 'primary' : 'default'"
                :secondary="activityKind !== value"
                @click="activityKind = value"
                >{{ value ? t(`kinds.${value}`) : t('all') }}</NButton
              >
            </div>

            <NSpin :show="entryLoading && !entries"
              ><div v-for="entry in displayedEntries" :key="entry.id" class="activity-row">
                <ChampionIcon :champion-id="entry.content.championId" class="row-icon" /><span
                  class="champion-name"
                  >{{ name(entry.content.championId) }}</span
                ><NButton text class="entry-link" @click="emit('open', entry)">{{
                  entry.content.title
                }}</NButton
                ><NTag
                  size="small"
                  :bordered="false"
                  :color="{ textColor: colors[entry.content.kind] }"
                  >{{ t(`kinds.${entry.content.kind}`) }}</NTag
                ><small class="muted">{{ date(entry.updatedAt) }}</small>
              </div>
              <NEmpty
                v-if="!entryLoading && !entries?.items.length"
                :description="tn('noEntriesMatch')"
            /></NSpin>
            <NPagination
              v-if="(expanded || search) && (entries?.total ?? 0) > 30"
              v-model:page="page"
              :page-size="30"
              :item-count="entries?.total"
              size="small"
            />
          </section>
        </main>
        <aside class="home-aside">
          <div class="quick-actions">
            <NButton type="primary" size="large" @click="emit('browse', true)"
              >＋ {{ t('add') }}</NButton
            ><NButton @click="emit('browse', false)">▦ {{ t('browse') }}</NButton
            ><NButton @click="transferOpen = true">⇅ {{ t('transfer') }}</NButton>
          </div>
          <section class="surface side-card">
            <div class="section-title">
              <h2>{{ t('coverage') }}</h2>
              <NButton text size="small" @click="showEntries(false)">{{ t('viewAll') }}</NButton>
            </div>
            <NButton
              v-for="kind in kinds"
              :key="kind"
              text
              class="coverage-row"
              @click="selectCoverage(kind)"
              ><span>{{ t(`kinds.${kind}`) }}</span
              ><span>{{ counts[kind] }}</span
              ><span class="bar"
                ><span
                  :style="{
                    width: `${total ? (counts[kind] / total) * 100 : 0}%`,
                    background: colors[kind]
                  }" /></span
            ></NButton>
          </section>
          <section class="surface side-card">
            <div class="section-title">
              <h2>{{ t('upcoming') }}</h2>
              <NButton text size="small" @click="emit('practice', null)">{{
                t('viewAll')
              }}</NButton>
            </div>
            <div v-for="item in home?.upcoming" :key="item.id" class="practice-row">
              <ChampionIcon :champion-id="item.content.championId" class="row-icon" />
              <div class="practice-label">
                <NButton text @click="emit('practice', item.id)">{{ item.content.title }}</NButton
                ><small class="muted"
                  >{{ name(item.content.championId) }} · {{ hw(item.content.state) }}</small
                >
              </div>
              <NButton
                size="tiny"
                :type="item.content.state === 'pending' ? 'primary' : 'default'"
                :loading="practiceBusy === item.id"
                @click="start(item)"
                >{{ t(item.content.state === 'pending' ? 'start' : 'continue') }}</NButton
              >
            </div>
            <NEmpty v-if="home && !home.upcoming.length" :description="t('practiceEmpty')" />
          </section>
        </aside>
      </div>
    </NSpin>
    <NModal
      v-model:show="transferOpen"
      preset="card"
      :title="t('transfer')"
      class="next-modal w-160! max-w-[95vw]!"
      ><NotebookTransfer :champion-id="null" @changed="refresh"
    /></NModal>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useInstance } from '@renderer-shared/shards'
import {
  kinds,
  listSchema,
  type HandbookHome,
  type NotebookContent,
  type NotebookEntry,
  type NotebookPage
} from '@shared/pro/notebook'
import { isChampionNameMatch } from '@shared/utils/string-match'
import { useTranslation } from 'i18next-vue'
import {
  BookOpen24Regular,
  Document24Regular,
  TargetArrow24Regular,
  Clock24Regular,
  Note24Regular,
  Flash24Regular,
  ArrowSwap24Regular,
  Star24Filled,
  Star24Regular,
  Box24Regular
} from '@vicons/fluent'
import {
  NButton,
  NCheckbox,
  NEmpty,
  NInput,
  NIcon,
  NModal,
  NPagination,
  NSelect,
  NSpin,
  NTag,
  NTooltip
} from 'naive-ui'
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import NotebookTransfer from '../../settings/NotebookTransfer.vue'
const props = defineProps<{
  active: boolean
  champions: { id: number; name: string; keywords?: string }[]
  revision: unknown
}>()
const emit = defineEmits<{
  select: [id: number, kind?: NotebookContent['kind']]
  open: [entry: NotebookEntry]
  browse: [add: boolean]
  practice: [entryId: string | null]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbook' })
const { t: tn } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: tw } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const { t: hw } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const api = useInstance(NotebookRenderer)
const home = shallowRef<HandbookHome | null>(null),
  entries = shallowRef<NotebookPage | null>(null)
const loading = ref(false),
  error = ref(false),
  entryLoading = ref(false),
  entryError = ref(false)
const search = ref(''),
  position = ref<string | null>(null),
  contentKind = ref<NotebookContent['kind'] | null>(null),
  activityKind = ref<NotebookContent['kind'] | null>(null),
  sort = ref('recent'),
  favoritesOnly = ref(false),
  recentOnly = ref(false),
  page = ref(1),
  transferOpen = ref(false)
const favoriteBusy = ref<number | null>(null),
  practiceBusy = ref<string | null>(null),
  activitySection = ref<HTMLElement>()
const colors = { note: '#3eaf90', combo: '#479fc7', matchup: '#aa78c9', build: '#c79c43' }
const kindIcons = {
  note: Note24Regular,
  combo: Flash24Regular,
  matchup: ArrowSwap24Regular,
  build: Box24Regular
}
const expanded = ref(false)
const displayedEntries = computed(() =>
  expanded.value || search.value.trim() ? entries.value?.items : entries.value?.items.slice(0, 5)
)
const name = (id: number) => props.champions.find((c) => c.id === id)?.name ?? `#${id}`
const date = (time: number) => new Date(time).toLocaleDateString()
const matches = (id: number) => {
  const champion = props.champions.find((c) => c.id === id),
    value = search.value.trim()
  return (
    !value || String(id) === value || isChampionNameMatch(value, champion?.keywords ?? name(id))
  )
}
const owned = computed(() => home.value?.champions.filter((c) => c.total > 0 || c.added) ?? [])
const counts = computed(
  () =>
    Object.fromEntries(
      kinds.map((k) => [k, owned.value.reduce((sum, c) => sum + c[k], 0)])
    ) as Record<NotebookContent['kind'], number>
)
const total = computed(() => owned.value.reduce((sum, c) => sum + c.total, 0))
const visibleChampions = computed(() =>
  owned.value
    .filter(
      (c) =>
        (!position.value || c.positions.includes(position.value)) &&
        (!contentKind.value || c[contentKind.value] > 0) &&
        (!favoritesOnly.value || c.favorite) &&
        matches(c.championId)
    )
    .sort(
      (a, b) =>
        (sort.value === 'recent'
          ? b.updatedAt - a.updatedAt
          : sort.value === 'count'
            ? b.total - a.total
            : 0) || name(a.championId).localeCompare(name(b.championId))
    )
)
const positionOptions = computed(() =>
  ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map((value) => ({
    value,
    label: `${tn(`positions.${value}`)} · ${owned.value.filter((c) => c.positions.includes(value)).length}`
  }))
)
const kindOptions = computed(() => kinds.map((value) => ({ value, label: t(`kinds.${value}`) })))
const sortOptions = computed(() =>
  ['recent', 'name', 'count'].map((value) => ({ value, label: tn(`sorts.${value}`) }))
)
let generation = 0,
  entryGeneration = 0,
  timer: ReturnType<typeof setTimeout> | undefined
async function loadHome() {
  const current = ++generation
  if (!props.active) return
  loading.value = true
  error.value = false
  try {
    const value = await api.home()
    if (current === generation) home.value = value
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
useQueryCache(
  () => JSON.stringify([search.value, activityKind.value, recentOnly.value, page.value]),
  entries,
  () => null
)
async function loadEntries() {
  const current = ++entryGeneration
  if (!props.active) return
  entryLoading.value = true
  entryError.value = false
  try {
    const value = await api.list(
      listSchema.parse({
        search: search.value,
        searchChampionIds: search.value.trim()
          ? props.champions.filter((c) => matches(c.id)).map((c) => c.id)
          : [],
        kind: activityKind.value,
        page: page.value,
        order: 'recent',
        updatedSince: recentOnly.value ? Date.now() - 7 * 86400000 : undefined
      })
    )
    if (current === entryGeneration) entries.value = value
  } catch {
    if (current === entryGeneration) entryError.value = true
  } finally {
    if (current === entryGeneration) entryLoading.value = false
  }
}
function refresh() {
  return Promise.all([loadHome(), loadEntries()])
}
function selectCoverage(kind: NotebookContent['kind']) {
  contentKind.value = kind
  activityKind.value = kind
}
function reset() {
  search.value = ''
  position.value = null
  contentKind.value = null
  favoritesOnly.value = false
  recentOnly.value = false
  activityKind.value = null
}
async function showEntries(recent: boolean) {
  search.value = ''
  expanded.value = true
  activityKind.value = null
  recentOnly.value = recent
  await nextTick()
  activitySection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function favorite(champion: HandbookHome['champions'][number]) {
  if (favoriteBusy.value !== null) return
  favoriteBusy.value = champion.championId
  try {
    await api.favoriteChampion(champion.championId, !champion.favorite)
    await loadHome()
  } catch {
    error.value = true
  } finally {
    favoriteBusy.value = null
  }
}
function start(item: import('@shared/pro/notebook/handbook').PracticePlan) {
  emit('practice', item.id)
}

watch([search, activityKind, recentOnly], () => {
  page.value = 1
  entryGeneration++
  clearTimeout(timer)
  timer = setTimeout(loadEntries, 180)
})
watch(page, loadEntries)
watch(
  () => props.champions,
  () => {
    if (search.value.trim()) void loadEntries()
  }
)
watch(
  [() => props.active, () => props.revision],
  () => {
    generation++
    entryGeneration++
    clearTimeout(timer)
    if (props.active) void refresh()
  },
  { immediate: true }
)
api.onChanged(() => {
  if (props.active) void refresh()
})
onScopeDispose(() => {
  generation++
  entryGeneration++
  clearTimeout(timer)
})
useRefreshFeedback(
  () => error.value,
  () => tn('loadFailed')
)
useRefreshFeedback(
  () => entryError.value,
  () => tn('loadFailed')
)
</script>
<style scoped>
.handbook-home {
  --home-surface: color-mix(in srgb, var(--la-card-surface-95), white 55%);
  --home-border: rgb(var(--la-card-border-rgb) / 0.09);
}
[data-theme='dark'] .handbook-home {
  --home-surface: color-mix(in srgb, var(--la-card-surface-95), white 4%);
}
h1,
h2,
p {
  margin: 0;
  line-height: 1.4;
}
h1 {
  font-size: 24px;
  font-weight: 700;
}
h2 {
  font-size: 16px;
  font-weight: 650;
}
p {
  margin-top: 5px;
  opacity: 0.6;
  font-size: 13px;
}
.home-heading,
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.home-heading {
  margin-bottom: 20px;
}
.section-title {
  margin-bottom: 14px;
}
.home-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
}
.home-main,
.home-aside {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
.surface {
  background: var(--home-surface);
  border: 1px solid var(--home-border);
  border-radius: 9px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.summary-card {
  height: 116px;
  padding: 16px;
  text-align: left;
  white-space: normal;
}
.summary-card :deep(.n-button__content) {
  width: 100%;
  display: flex;
  gap: 12px;
  justify-content: flex-start;
}
.summary-card span span,
.summary-card small,
.summary-card strong {
  display: block;
}
.summary-card strong {
  font-size: 25px;
  line-height: 1.4;
}
.summary-card small {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 5px;
}
.summary-symbol {
  font-size: 32px;
  opacity: 0.6;
}
.mint {
  color: var(--la-color-text-primary);
  opacity: 0.8;
}
.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.filters :deep(.n-select) {
  width: 145px;
}
.filters :deep(.n-input) {
  flex: 1;
  min-width: 180px;
}
.champion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
  gap: 16px;
}
.hero-card {
  padding: 18px;
  position: relative;
  min-width: 0;
  border-radius: 12px;
  transition: border-color 0.15s;
}
.favorite {
  position: absolute;
  top: 16px;
  right: 12px;
  z-index: 1;
}
.hero-open {
  display: flex;
  width: 100%;
  padding-right: 24px;
  box-sizing: border-box;
  text-align: left;
}
.hero-open :deep(.n-button__content) {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  width: 100%;
  min-width: 0;
}
.hero-identity {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.hero-open strong {
  font-size: 18px;
  line-height: 1.25;
  font-weight: 700;
  white-space: normal;
  overflow-wrap: anywhere;
}
.hero-icon {
  width: 72px !important;
  height: 72px !important;
  flex-shrink: 0;
  border-radius: 8px;
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.roles :deep(.n-tag) {
  border-radius: 5px;
}
.content-counts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 18px;
}
.content-count {
  width: 100%;
  height: 44px;
  padding: 0;
  border-radius: 8px;
  color: color-mix(in srgb, var(--kind-color), black 20%);
  background: color-mix(in srgb, var(--kind-color) 10%, transparent);
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.content-count :deep(.n-button__content) {
  gap: 7px;
}
.hero-card:hover {
  border-color: rgb(var(--la-card-border-rgb) / 0.24);
}
.muted {
  opacity: 0.55;
  font-size: 12px;
}
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.side-card,
.activity {
  padding: 16px;
}
.coverage-row {
  width: 100%;
  margin: 10px 0;
}
.coverage-row :deep(.n-button__content) {
  width: 100%;
  display: grid;
  grid-template-columns: 64px 24px 1fr;
  gap: 8px;
  text-align: left;
}
.bar {
  height: 8px;
  background: rgb(var(--la-card-border-rgb) / 0.12);
  border-radius: 8px;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  border-radius: 8px;
}
.practice-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--home-border);
}
.row-icon {
  height: 32px !important;
  width: 32px !important;
  border-radius: 4px;
  flex-shrink: 0;
}
.practice-label {
  flex: 1;
  min-width: 0;
}
.practice-label :deep(.n-button) {
  max-width: 100%;
  white-space: normal;
  text-align: left;
}
.practice-label small {
  display: block;
  margin-top: 5px;
}
.activity-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.activity-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 11px 0;
  border-top: 1px solid var(--home-border);
}
.entry-link {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
}
.entry-link :deep(.n-button__content) {
  max-width: 100%;
  overflow-wrap: anywhere;
}
.champion-name {
  width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity :deep(.n-pagination) {
  margin-top: 12px;
}
@media (max-width: 1250px) {
  .summary-symbol {
    display: none;
  }
  .summary-card {
    padding: 12px;
  }
  .home-layout {
    grid-template-columns: minmax(0, 1fr) 250px;
  }
  .summary-grid {
    gap: 10px;
  }
}
@media (max-width: 1000px) {
  .home-layout {
    grid-template-columns: 1fr;
  }
  .home-aside {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .quick-actions {
    grid-column: 1/-1;
    flex-direction: row;
  }
  .quick-actions > * {
    flex: 1;
  }
}
@media (max-width: 650px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .home-aside {
    display: flex;
  }
  .activity-row .champion-name,
  .activity-row > small {
    display: none;
  }
  .quick-actions {
    flex-wrap: wrap;
  }
}
[data-theme='dark'] .content-count {
  color: var(--kind-color);
}
</style>
