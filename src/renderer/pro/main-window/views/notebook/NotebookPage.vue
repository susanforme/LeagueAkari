<template>
  <div class="notebook-page flex h-full min-w-0 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="BookOpen24Regular" size="22" />
      <span class="text-base font-bold">{{ t('title') }}</span>
      <NRadioGroup v-model:value="tab" size="small" @update:value="practiceEntryId = null">
        <NRadioButton value="library">{{ th('title') }}</NRadioButton>
        <NRadioButton value="practice">{{ tw('practice') }}</NRadioButton>
        <NRadioButton value="quick">{{ t('quick') }}</NRadioButton>
      </NRadioGroup>
    </div>
    <NScrollbar class="min-h-0 flex-1">
      <div class="flex min-w-0 flex-col gap-4 px-6 py-4">
        <KeepAlive
          ><PracticeWorkbench
            v-if="tab === 'practice'"
            :champion-id="practiceEntryId ? null : championId"
            :entry-id="practiceEntryId"
            :champions="champions"
            @open="view"
          />
        </KeepAlive>
        <KeepAlive
          ><PreGameWorkbench
            v-if="tab === 'quick'"
            :initial-champion="championId"
            @open="view"
            @create="createMatchup"
          />
        </KeepAlive>
        <template v-if="tab === 'library'">
          <NAlert v-if="importedBuild" type="info">
            {{ t('importReady') }}
            <NButton text @click="acceptImport">{{ t('openDraft') }}</NButton>
          </NAlert>

          <KeepAlive
            ><AddChampion
              v-if="directoryOpen"
              :champions="champions"
              @back="directoryOpen = false"
              @select="chooseDirectoryChampion" />
            <HandbookHome
              v-else-if="!championId"
              :active="active && tab === 'library'"
              :champions="champions"
              :revision="summaries"
              @select="openChampion"
              @open="view"
              @browse="openDirectory"
              @practice="openPractice" />
            <ChampionWorkspace
              v-else-if="championId"
              :champion-id="championId"
              :section="detailPractice ? 'practice' : (kind ?? 'overview')"
              :revision="summaries"
              :champions="champions"
              @select="openChampion"
              @home="selectChampion(null)"
              @add="openDirectory(true)"
              @section="selectSection"
              @open="view"
            >
              <template #actions>
                <NDropdown trigger="click" :options="createOptions" @select="newEntry"
                  ><NButton size="small" type="primary" :disabled="busy"
                    >{{ t('newEntry') }} ＋</NButton
                  ></NDropdown
                >
                <NButton
                  size="small"
                  :type="deleted ? 'warning' : 'default'"
                  quaternary
                  @click="toggleTrash"
                  >{{ t('trash') }}</NButton
                >
              </template>
              <PracticeWorkbench
                v-if="detailPractice"
                :champion-id="championId"
                :champions="champions"
                @open="view"
              />
              <EntryWorkbench
                v-else-if="(kind === 'combo' || kind === 'build') && !deleted"
                :entries="result?.items ?? []"
                :kind="kind"
                :skills="skills"
                :editing-id="inlineEditor ? editing?.id : undefined"
                @create="newEntry(kind)"
                @edit="edit"
                @open="view"
                @changed="refresh"
                @manage="manageEntry"
              >
                <template v-if="inlineEditor && editing" #editor>
                  <section class="hw-panel hw-stack">
                    <h3>{{ t(editing.id ? 'edit' : 'newEntry') }}</h3>
                    <NAlert v-if="editError" type="error">{{ t(editError) }}</NAlert>
                    <NForm :disabled="busy" :inert="busy"
                      ><EntryEditor
                        :content="editing.content"
                        :entry-id="editing.id"
                        :catalog="catalog"
                        :skills="skills"
                        :champions="champions"
                    /></NForm>
                    <div class="hw-row">
                      <NButton type="primary" :loading="busy" @click="save(false)">{{
                        t('save')
                      }}</NButton
                      ><NButton :disabled="busy" @click="closeEditor">{{ t('cancel') }}</NButton
                      ><NButton
                        v-if="editError === 'conflict'"
                        :disabled="busy"
                        @click="save(true)"
                        >{{ t('saveCopy') }}</NButton
                      >
                    </div>
                  </section>
                </template>
                <template #filters
                  ><NInput
                    v-model:value="search"
                    size="small"
                    clearable
                    :placeholder="t('search')"
                    :aria-label="t('search')"
                  /><EntitySelect
                    v-model:value="opponentId"
                    size="small"
                    :options="champions"
                    kind="champion"
                    :placeholder="t('opponent')"
                  />
                  <NInput
                    v-model:value="targetPatch"
                    size="small"
                    :maxlength="20"
                    clearable
                    :placeholder="tw('targetPatch')"
                    :aria-label="tw('targetPatch')"
                  />
                  <NSelect
                    v-model:value="reviewState"
                    size="small"
                    :disabled="!validPatch"
                    :options="reviewOptions"
                    :aria-label="tw('patchReview')"
                  />
                </template>
                <template #pagination
                  ><NPagination
                    v-if="result && result.total > 30"
                    v-model:page="page"
                    :page-size="30"
                    :item-count="result.total"
                    simple
                /></template>
              </EntryWorkbench>
              <template v-else>
                <div class="notebook-filters flex flex-wrap items-center gap-2">
                  <NInput
                    v-model:value="search"
                    class="filter-search"
                    size="small"
                    clearable
                    :maxlength="200"
                    :placeholder="t('search')"
                    :aria-label="t('search')"
                  />
                  <EntitySelect
                    v-model:value="opponentId"
                    size="small"
                    :options="champions"
                    kind="champion"
                    :placeholder="t('opponent')"
                  />
                  <NInput
                    v-model:value="targetPatch"
                    size="small"
                    :maxlength="20"
                    clearable
                    :placeholder="tw('targetPatch')"
                    :aria-label="tw('targetPatch')"
                  />
                  <NSelect
                    v-model:value="reviewState"
                    size="small"
                    :disabled="!validPatch"
                    :options="reviewOptions"
                    :aria-label="tw('patchReview')"
                  />
                  <RefreshButton secondary @click="refresh" />
                </div>

                <NSpin :show="loading && !result">
                  <div class="flex flex-col gap-3">
                    <NCard
                      v-for="entry in result?.items"
                      :key="entry.id"
                      size="small"
                      class="entry-card"
                    >
                      <template #header>
                        <div class="flex flex-wrap items-center gap-2">
                          <ChampionIcon
                            :champion-id="entry.content.championId"
                            class="size-8! rounded"
                          />
                          <NButton text class="entry-title" @click="view(entry)">{{
                            entry.content.title
                          }}</NButton>
                          <NTag size="small">{{ t(`kinds.${entry.content.kind}`) }}</NTag>
                          <NTag v-if="entry.content.pinned" size="small" type="warning">{{
                            t('pinned')
                          }}</NTag>
                        </div>
                      </template>
                      <EntryBody :content="entry.content" :skills="skills" compact />
                      <div
                        class="mt-4 flex flex-wrap items-center gap-2 border-t border-(--la-color-popover-border) pt-3"
                      >
                        <div class="flex flex-wrap gap-2">
                          <template v-if="!entry.deleted">
                            <NButton size="small" secondary :disabled="busy" @click="edit(entry)">{{
                              t('edit')
                            }}</NButton>
                            <NButton
                              size="small"
                              quaternary
                              :disabled="busy"
                              @click="mutate(entry, 'pin')"
                              >{{ t(entry.content.pinned ? 'unpin' : 'pin') }}</NButton
                            >
                            <NButton
                              size="small"
                              quaternary
                              :disabled="busy"
                              @click="copy(entry)"
                              >{{ t('copy') }}</NButton
                            >
                            <NButton
                              size="small"
                              quaternary
                              :disabled="busy"
                              @click="mutate(entry, 'trash')"
                              >{{ t('delete') }}</NButton
                            >
                          </template>
                          <NButton
                            v-else
                            size="small"
                            :disabled="busy"
                            @click="mutate(entry, 'recover')"
                            >{{ t('recover') }}</NButton
                          >
                          <NButton size="small" quaternary @click="showHistory(entry)">{{
                            t('history')
                          }}</NButton>
                        </div>
                      </div>
                      <NotebookEntryTools
                        v-if="!entry.deleted"
                        :entry="entry"
                        :target-patch="validPatch"
                        @open="view"
                        @changed="refresh"
                      />
                    </NCard>
                    <NEmpty
                      v-if="result && !result.total"
                      :description="
                        t(
                          deleted ? 'trashEmpty' : search || opponentId ? 'noEntriesMatch' : 'empty'
                        )
                      "
                    >
                      <template v-if="!deleted" #extra>
                        <NButton
                          v-if="search || opponentId"
                          size="small"
                          @click="
                            () => {
                              search = ''
                              opponentId = null
                            }
                          "
                          >{{ t('clearFilters') }}</NButton
                        >
                        <NButton
                          v-else
                          size="small"
                          type="primary"
                          @click="newEntry(kind ?? 'note')"
                          >{{ t('create', { kind: t(`kinds.${kind ?? 'note'}`) }) }}</NButton
                        >
                      </template>
                    </NEmpty>
                  </div>
                </NSpin>
                <NPagination
                  v-if="result && result.total > 30"
                  v-model:page="page"
                  :page-size="30"
                  :item-count="result.total"
                />
              </template> </ChampionWorkspace
          ></KeepAlive>
        </template>
      </div>
    </NScrollbar>

    <NModal
      :show="!!editing && active && !inlineEditor"
      preset="card"
      :title="t(editing?.id ? 'edit' : 'newEntry')"
      :style="{
        width:
          editing?.content.kind === 'combo' || editing?.content.kind === 'build'
            ? '1080px'
            : '800px',
        maxWidth: '95vw'
      }"
      :mask-closable="false"
      :close-on-esc="!busy"
      @update:show="
        (show) => {
          if (!show) closeEditor()
        }
      "
    >
      <template v-if="editing">
        <div class="mb-3 flex items-center gap-2">
          <ChampionIcon :champion-id="editing.content.championId" class="size-9! rounded" />
          {{ resources.champions.name(editing.content.championId) }}
          <NTag>{{ t(`kinds.${editing.content.kind}`) }}</NTag>
        </div>
        <NAlert v-if="editError" type="error" class="mb-3">{{ t(editError) }}</NAlert>
        <NScrollbar style="max-height: 65vh">
          <NForm :disabled="busy" :inert="busy">
            <EntryEditor
              :content="editing.content"
              :entry-id="editing.id"
              :catalog="catalog"
              :skills="skills"
              :champions="champions"
            />
          </NForm>
        </NScrollbar>
        <div class="mt-4 flex justify-end gap-2">
          <NButton :disabled="busy" @click="closeEditor">{{ t('cancel') }}</NButton>
          <NButton v-if="editError === 'conflict'" :disabled="busy" @click="save(true)">{{
            t('saveCopy')
          }}</NButton>
          <NButton type="primary" :loading="busy" @click="save(false)">{{ t('save') }}</NButton>
        </div>
      </template>
    </NModal>
    <NModal
      :show="!!viewing && active"
      preset="card"
      :title="viewing?.content.title"
      class="w-200! max-w-[95vw]!"
      @close="viewing = null"
      @update:show="
        (show) => {
          if (!show) viewing = null
        }
      "
    >
      <NScrollbar style="max-height: 70vh"
        ><EntryBody v-if="viewing" :content="viewing.content" :skills="skills"
      /></NScrollbar>
      <NotebookEntryTools
        v-if="viewing && !viewing.deleted"
        :entry="viewing"
        :target-patch="validPatch"
        @open="view"
        @changed="
          (entry) => {
            viewing = entry
            void refresh()
          }
        "
      />
      <div v-if="viewing && !viewing.deleted" class="mt-4 flex justify-end gap-2">
        <NButton
          @click="
            () => {
              copy(viewing!)
              viewing = null
            }
          "
          >{{ t('copy') }}</NButton
        >
        <NButton
          type="primary"
          @click="
            () => {
              edit(viewing!)
              viewing = null
            }
          "
          >{{ t('edit') }}</NButton
        >
      </div>
    </NModal>
    <NModal
      :show="!!historyEntry && active"
      preset="card"
      :title="t('history')"
      class="w-200! max-w-[95vw]!"
      @close="historyEntry = null"
      @update:show="
        (show) => {
          if (!show) historyEntry = null
        }
      "
    >
      <NSpin :show="historyLoading && !history">
        <NScrollbar style="max-height: 65vh">
          <NCollapse>
            <NCollapseItem
              v-for="entry in history?.items"
              :key="entry.revision"
              :name="entry.revision"
              :title="`${t('revision', { n: entry.revision })} · ${new Date(entry.updatedAt).toLocaleString()}`"
            >
              <div class="mb-2 font-bold">{{ entry.content.title }}</div>
              <EntryBody :content="entry.content" :skills="skills" />
              <NButton class="mt-3" :disabled="busy" @click="restore(entry)">{{
                t('restore')
              }}</NButton>
            </NCollapseItem>
          </NCollapse>
        </NScrollbar>
        <NPagination
          v-if="history && history.total > 20"
          v-model:page="historyPage"
          class="mt-3"
          :page-size="20"
          :item-count="history.total"
        />
      </NSpin>
    </NModal>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useInstance } from '@renderer-shared/shards'
import {
  NOTEBOOK_ROUTE,
  blankContent,
  contentSchema,
  kinds,
  listSchema,
  type ChangeNotebook,
  type NotebookChampionSummary,
  type NotebookContent,
  type NotebookEntry,
  type NotebookPage,
  type SaveNotebook
} from '@shared/pro/notebook'
import { BookOpen24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NCard,
  NDropdown,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NForm,
  NIcon,
  NInput,
  NModal,
  NPagination,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NScrollbar,
  NSpin,
  NTag,
  useDialog
} from 'naive-ui'
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import AddChampion from './workspace/AddChampion.vue'
import ChampionWorkspace from './workspace/ChampionWorkspace.vue'
import PracticeWorkbench from './workspace/PracticeWorkbench.vue'
import PreGameWorkbench from './workspace/PreGameWorkbench.vue'
import EntryWorkbench from './workspace/EntryWorkbench.vue'
import HandbookHome from './HandbookHome.vue'
import EntitySelect from './EntitySelect.vue'
import EntryBody from './EntryBody.vue'
import EntryEditor from './EntryEditor.vue'
import NotebookEntryTools from './NotebookEntryTools.vue'
import { importedBuild } from './import-draft'
import { useNotebookResources } from './useNotebookResources'
import { z } from 'zod'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'

const { t } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: tw } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const api = useInstance(NotebookRenderer)
const dialog = useDialog()
const route = useRoute()
const router = useRouter()
const { t: th } = useTranslation(undefined, { keyPrefix: 'pro.handbook' })
const detailPractice = ref(false)
const directoryOpen = ref(false),
  directoryAdd = ref(false),
  practiceEntryId = ref<string | null>(null)
const active = ref(false)
const tab = ref('library')
const championId = ref<number | null>(null)
const opponentId = ref<number | null>(null)
const summaries = shallowRef<NotebookChampionSummary[]>([])
const summaryLoading = ref(false)
const summaryError = ref(false)
const kind = ref<NotebookContent['kind'] | null>(null)
const search = ref('')
const targetPatch = ref(''),
  reviewState = ref<'all' | 'unmarked' | 'needsReview' | 'confirmed'>('all')
const validPatch = computed(() =>
  /^\d+\.\d+$/.test(targetPatch.value ?? '') ? targetPatch.value : null
)
const reviewOptions = computed(() =>
  ['all', 'unmarked', 'needsReview', 'confirmed'].map((value) => ({
    value,
    label: tw(`reviewStates.${value}`)
  }))
)
const deleted = ref(false)
const page = ref(1)
const result = shallowRef<NotebookPage | null>(null)
const loading = ref(false)
const error = ref('')
const busy = ref(false)
const editing = ref<SaveNotebook | null>(null)
const inlineEditor = computed(
  () =>
    !!editing.value &&
    editing.value.content.kind === 'combo' &&
    kind.value === 'combo' &&
    tab.value === 'library' &&
    editing.value.content.championId === championId.value &&
    !directoryOpen.value &&
    !deleted.value
)
const editError = ref('')
let savedDraft = ''
const viewing = shallowRef<NotebookEntry | null>(null)
const historyEntry = shallowRef<NotebookEntry | null>(null)
const history = shallowRef<NotebookPage | null>(null)
const historyPage = ref(1)
const historyError = ref('')
const historyLoading = ref(false)
const focusChampion = computed(
  () =>
    editing.value?.content.championId ??
    viewing.value?.content.championId ??
    historyEntry.value?.content.championId ??
    championId.value
)
const { resources, catalog, champions, skills, unavailable } = useNotebookResources(focusChampion)
const createOptions = computed(() =>
  kinds.map((key) => ({ key, label: t('create', { kind: t(`kinds.${key}`) }) }))
)
let summaryGeneration = 0
async function loadSummaries() {
  const current = ++summaryGeneration
  if (!active.value) return
  summaryLoading.value = true
  summaryError.value = false
  try {
    const next = await api.champions()
    if (current === summaryGeneration) summaries.value = next
  } catch {
    if (current === summaryGeneration) summaryError.value = true
  } finally {
    if (current === summaryGeneration) summaryLoading.value = false
  }
}
function openDirectory(add: boolean) {
  directoryAdd.value = add
  directoryOpen.value = true
}
async function openChampion(id: number, selectedKind?: NotebookContent['kind']) {
  await router.push({ name: NOTEBOOK_ROUTE, query: { champion: String(id) } })
  syncChampion()
  kind.value = selectedKind ?? null
  detailPractice.value = false
}
async function chooseDirectoryChampion(id: number) {
  directoryOpen.value = false
  await openChampion(id)
}
function openPractice(entryId: string | null) {
  practiceEntryId.value = entryId
  tab.value = 'practice'
}
function selectChampion(id: number | null) {
  void router.push({ name: NOTEBOOK_ROUTE, query: id ? { champion: id } : {} })
}
function syncChampion() {
  if (route.name !== NOTEBOOK_ROUTE) return
  if (route.query.kind === 'build') {
    kind.value = 'build'
    tab.value = 'library'
    deleted.value = false
  }
  const selected = Number(route.query.champion)
  const next = Number.isSafeInteger(selected) && selected > 0 ? selected : null
  const opponent = Number(route.query.opponent)
  if (Number.isSafeInteger(opponent) && opponent > 0) {
    opponentId.value = opponent
    kind.value = 'matchup'
    tab.value = 'library'
    deleted.value = false
  }
  if (championId.value === next) return
  championId.value = next
  kind.value = route.query.kind === 'build' ? 'build' : null
  search.value = ''
  opponentId.value = Number.isSafeInteger(opponent) && opponent > 0 ? opponent : null
  if (opponentId.value) kind.value = 'matchup'
  deleted.value = false
  tab.value = 'library'
}
function toggleTrash() {
  deleted.value = !deleted.value
  detailPractice.value = false
  kind.value ??= 'note'
}
function selectSection(value: string) {
  detailPractice.value = value === 'practice'
  kind.value = ['note', 'combo', 'matchup', 'build'].includes(value)
    ? (value as NotebookContent['kind'])
    : null
  deleted.value = false
}
async function createMatchup(champion: number, opponent: number) {
  await openChampion(champion, 'matchup')
  tab.value = 'library'
  newEntry('matchup')
  if (editing.value) editing.value.content.opponentId = opponent
}
async function refresh() {
  await Promise.all([load(), loadSummaries()])
}
let generation = 0
let historyGeneration = 0
let debounce: ReturnType<typeof setTimeout> | undefined
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const failure = (cause: unknown) =>
  /conflict/.test(String((cause as { message?: string })?.message ?? cause))
    ? 'conflict'
    : 'saveFailed'
useQueryCache(
  () =>
    JSON.stringify([
      championId.value,
      kind.value,
      opponentId.value,
      search.value,
      validPatch.value,
      reviewState.value,
      deleted.value,
      page.value
    ]),
  result,
  () => null
)
useQueryCache(
  () => JSON.stringify([historyEntry.value?.id, historyPage.value]),
  history,
  () => null
)
async function load() {
  const current = ++generation
  if (!active.value) return
  if (!championId.value) {
    result.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const next = await api.list(
      listSchema.parse({
        championId: championId.value,
        kind: kind.value,
        opponentId: opponentId.value,
        search: search.value,
        targetPatch: validPatch.value,
        reviewState: reviewState.value,
        deleted: deleted.value,
        page: page.value
      })
    )
    if (current === generation) {
      result.value = next
      if (!next.items.length && page.value > 1) page.value--
    }
  } catch {
    if (current === generation) error.value = 'loadFailed'
  } finally {
    if (current === generation) loading.value = false
  }
}
function confirmDiscard(action: () => void) {
  if (busy.value) return
  if (!editing.value || JSON.stringify(editing.value) === savedDraft) {
    action()
    return
  }
  dialog.warning({
    title: t('unsaved'),
    content: t('discardQuestion'),
    positiveText: t('discard'),
    negativeText: t('keepEditing'),
    onPositiveClick: action
  })
}
function begin(content: NotebookContent, entry?: NotebookEntry) {
  confirmDiscard(() => {
    editing.value = {
      id: entry?.id ?? null,
      expectedRevision: entry?.revision ?? 0,
      content: clone(content)
    }
    savedDraft = JSON.stringify(editing.value)
    editError.value = ''
  })
}
function newEntry(value: NotebookContent['kind']) {
  if (championId.value)
    begin({
      ...blankContent(championId.value, value),
      opponentId: value === 'matchup' ? opponentId.value : null
    })
}
function manageEntry(entry: NotebookEntry, action: string) {
  if (action === 'copy') copy(entry)
  else if (action === 'history') void showHistory(entry)
  else if (action === 'pin' || action === 'trash') void mutate(entry, action)
}
function edit(entry: NotebookEntry) {
  begin(entry.content, entry)
}
function copy(entry: NotebookEntry) {
  begin({
    ...clone(entry.content),
    title: t('copyTitle', { title: entry.content.title }).slice(0, 120)
  })
}
function closeEditor() {
  confirmDiscard(() => {
    editing.value = null
    editError.value = ''
  })
}
function view(entry: NotebookEntry) {
  viewing.value = entry
}
function acceptImport() {
  if (!importedBuild.value) return
  confirmDiscard(() => {
    const content = clone(importedBuild.value!)
    selectChampion(content.championId)
    content.title = t('matchBuildTitle', { id: content.source?.gameId })
    content.groups.forEach((group) => {
      group.name = t('finalItems')
    })
    editing.value = { id: null, expectedRevision: 0, content }
    savedDraft = ''
    editError.value = ''
    importedBuild.value = null
    tab.value = 'library'
  })
}
async function save(asCopy: boolean) {
  if (!editing.value || busy.value) return
  const validated = contentSchema.safeParse(editing.value.content)
  if (!validated.success) {
    editError.value = 'invalid'
    return
  }
  busy.value = true
  try {
    await api.save({
      ...editing.value,
      ...(asCopy ? { id: null, expectedRevision: 0 } : {}),
      content: validated.data
    })
    editing.value = null
    kind.value = validated.data.kind
    search.value = ''
    opponentId.value = null
    deleted.value = false
    page.value = 1
    await refresh()
  } catch (cause) {
    editError.value = failure(cause)
  } finally {
    busy.value = false
  }
}
async function mutate(entry: NotebookEntry, action: ChangeNotebook['action']) {
  if (busy.value) return
  busy.value = true
  try {
    await api.change({ id: entry.id, expectedRevision: entry.revision, action })
    await refresh()
  } catch (cause) {
    error.value = failure(cause)
  } finally {
    busy.value = false
  }
}
async function loadHistory() {
  const current = ++historyGeneration
  historyError.value = ''
  if (!historyEntry.value || !active.value) return
  historyLoading.value = true
  try {
    const next = await api.history(historyEntry.value.id, historyPage.value)
    if (current === historyGeneration) history.value = next
  } catch {
    if (current === historyGeneration) historyError.value = 'loadFailed'
  } finally {
    if (current === historyGeneration) historyLoading.value = false
  }
}
function showHistory(entry: NotebookEntry) {
  historyEntry.value = entry
  historyPage.value = 1
  void loadHistory()
}
async function restore(entry: NotebookEntry) {
  if (!historyEntry.value || busy.value) return
  busy.value = true
  try {
    historyEntry.value = await api.change({
      id: entry.id,
      expectedRevision: historyEntry.value.revision,
      action: 'restore',
      revision: entry.revision
    })
    historyPage.value = 1
    await Promise.all([refresh(), loadHistory()])
  } catch (cause) {
    historyError.value = failure(cause)
  } finally {
    busy.value = false
  }
}
api.onChanged(() => {
  if (active.value) void refresh()
})
watch(
  () => [route.query.champion, route.query.search, route.query.opponent],
  () => {
    syncChampion()
    if (route.name === NOTEBOOK_ROUTE && typeof route.query.search === 'string')
      search.value = route.query.search
  }
)
watch(historyPage, loadHistory)
watch(
  [championId, kind, search, opponentId, deleted, validPatch, reviewState],
  () => {
    page.value = 1
  },
  { flush: 'sync' }
)
watch([championId, kind, search, opponentId, deleted, validPatch, reviewState, page], () => {
  generation++
  clearTimeout(debounce)
  if (active.value) debounce = setTimeout(load, 160)
})
onActivated(() => {
  active.value = true
  syncChampion()
  if (typeof route.query.search === 'string') search.value = route.query.search
  if (importedBuild.value && !editing.value) acceptImport()
  void refresh()
  if (historyEntry.value) void loadHistory()
})
function deactivate() {
  active.value = false
  generation++
  historyGeneration++
  summaryGeneration++
  clearTimeout(debounce)
}
onDeactivated(deactivate)
onScopeDispose(deactivate)
useWorkspaceState(
  'pro-notebook',
  { championId, kind, search, opponentId, deleted, page, tab },
  z.object({
    championId: z.number().int().positive().nullable(),
    kind: z.enum(['note', 'combo', 'matchup', 'build']).nullable(),
    search: z.string().max(100),
    opponentId: z.number().int().positive().nullable(),
    deleted: z.boolean(),
    page: z.number().int().positive(),
    tab: z.string().max(30)
  })
)
useRefreshFeedback(
  () => error.value,
  () => t(error.value || 'loadFailed')
)
useRefreshFeedback(
  () => unavailable.value || summaryError.value,
  () => t(unavailable.value ? 'resourcesUnavailable' : 'loadFailed')
)
useRefreshFeedback(
  () => historyError.value,
  () => t(historyError.value)
)
</script>

<style scoped>
.notebook-filters > :deep(.n-input),
.notebook-filters > :deep(.n-select) {
  width: auto;
  min-width: 0;
  flex: 1 1 180px;
}
.notebook-filters > .filter-search {
  flex: 2 1 260px;
}
.entry-card {
  border-radius: 8px;
  background: var(--la-card-surface-90);
}
.entry-title {
  min-width: 0;
  max-width: 100%;
  font-weight: 600;
}
.entry-title :deep(.n-button__content) {
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}
</style>
