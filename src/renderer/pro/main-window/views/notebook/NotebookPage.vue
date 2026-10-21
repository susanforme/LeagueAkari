<template>
  <div class="notebook-page flex h-full min-w-0 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3"
    >
      <NIcon :component="BookOpen24Regular" size="22" />
      <span class="text-base font-bold">{{ t('title') }}</span>
      <NRadioGroup v-model:value="tab" size="small">
        <NRadioButton value="library">{{ t('library') }}</NRadioButton>
        <NRadioButton value="practice">{{ tw('practice') }}</NRadioButton>
        <NRadioButton value="quick">{{ t('quick') }}</NRadioButton>
      </NRadioGroup>
    </div>
    <NScrollbar class="min-h-0 flex-1">
      <div class="flex flex-col gap-4 p-6">
        <PracticePanel
          v-show="tab === 'practice'"
          :active="tab === 'practice' && active"
          :champion-id="championId"
          @open="view"
        />
        <PreGameNotebook v-if="tab === 'quick' && active" />
        <template v-else-if="tab === 'library'">
          <NAlert v-if="unavailable" type="warning">
            {{ t('resourcesUnavailable') }} <NButton text @click="reload">{{ t('retry') }}</NButton>
          </NAlert>
          <NAlert v-if="importedBuild" type="info">
            {{ t('importReady') }}
            <NButton text @click="acceptImport">{{ t('openDraft') }}</NButton>
          </NAlert>
          <NAlert v-if="summaryError" type="error">
            {{ t('loadFailed') }} <NButton text @click="loadSummaries">{{ t('retry') }}</NButton>
          </NAlert>
          <div v-show="!championId">
            <div class="mb-4 flex items-center justify-between">
              <span class="text-base font-bold">{{ t('chooseChampion') }}</span>
              <NButton size="small" :loading="summaryLoading" @click="loadSummaries">{{
                t('refresh')
              }}</NButton>
            </div>
            <NSpin :show="summaryLoading">
              <ChampionDirectory
                :champions="champions"
                :summaries="summaries"
                :loading="summaryLoading"
                @select="selectChampion"
              />
            </NSpin>
          </div>
          <template v-if="championId">
            <div class="flex flex-wrap items-center gap-4">
              <NButton size="small" @click="selectChampion(null)"
                >← {{ t('backToChampions') }}</NButton
              >
              <ChampionIcon :champion-id="championId" class="size-14! rounded-lg" />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-xl font-bold">{{ resources.champions.name(championId) }}</span>
                <span v-if="selectedSummary" class="text-xs opacity-60">{{
                  t('entryCount', { count: selectedSummary.total })
                }}</span>
              </div>
              <NDropdown trigger="click" :options="createOptions" @select="newEntry">
                <NButton type="primary" :disabled="busy">{{ t('newEntry') }} ＋</NButton>
              </NDropdown>
            </div>
            <div class="flex flex-wrap gap-2">
              <NButton
                size="small"
                :type="!kind && !deleted ? 'primary' : 'default'"
                secondary
                @click="selectKind(null)"
                >{{ t('allKinds') }}</NButton
              >
              <NButton
                v-for="value in kinds"
                :key="value"
                size="small"
                :type="kind === value && !deleted ? 'primary' : 'default'"
                secondary
                @click="selectKind(value)"
                >{{ t(`kinds.${value}`)
                }}<span v-if="selectedSummary" class="ml-2 opacity-70">{{
                  selectedSummary[value]
                }}</span></NButton
              >
              <NButton
                size="small"
                :type="deleted ? 'warning' : 'default'"
                quaternary
                @click="deleted = !deleted"
                >{{ t('trash')
                }}<span v-if="selectedSummary?.trash" class="ml-1">{{
                  selectedSummary.trash
                }}</span></NButton
              >
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <NInput
                v-model:value="search"
                class="min-w-48 flex-1"
                clearable
                :maxlength="200"
                :placeholder="t('search')"
                :aria-label="t('search')"
              />
              <EntitySelect
                v-model:value="opponentId"
                class="min-w-48 flex-1"
                :options="champions"
                kind="champion"
                :placeholder="t('opponent')"
              />
              <NButton size="small" @click="refresh">{{ t('refresh') }}</NButton>
            </div>
            <div class="flex flex-wrap gap-3">
              <NInput
                v-model:value="targetPatch"
                class="w-48!"
                :maxlength="20"
                clearable
                :placeholder="tw('targetPatch')"
                :aria-label="tw('targetPatch')"
              />
              <NSelect
                v-model:value="reviewState"
                class="w-48!"
                :disabled="!validPatch"
                :options="reviewOptions"
                :aria-label="tw('patchReview')"
              />
            </div>
            <NAlert v-if="error" type="error" closable @close="error = ''">{{ t(error) }}</NAlert>
            <NSpin :show="loading">
              <div class="flex flex-col gap-3">
                <NCard v-for="entry in result?.items" :key="entry.id" size="small">
                  <template #header>
                    <div class="flex items-center gap-2">
                      <ChampionIcon
                        :champion-id="entry.content.championId"
                        class="size-8! rounded"
                      />
                      <NButton text @click="view(entry)">{{ entry.content.title }}</NButton>
                      <NTag size="small">{{ t(`kinds.${entry.content.kind}`) }}</NTag>
                      <NTag v-if="entry.content.pinned" size="small" type="warning">{{
                        t('pinned')
                      }}</NTag>
                    </div>
                  </template>
                  <template #header-extra>
                    <div class="flex flex-wrap gap-2">
                      <template v-if="!entry.deleted">
                        <NButton size="tiny" :disabled="busy" @click="edit(entry)">{{
                          t('edit')
                        }}</NButton>
                        <NButton size="tiny" :disabled="busy" @click="mutate(entry, 'pin')">{{
                          t(entry.content.pinned ? 'unpin' : 'pin')
                        }}</NButton>
                        <NButton size="tiny" :disabled="busy" @click="copy(entry)">{{
                          t('copy')
                        }}</NButton>
                        <NButton size="tiny" :disabled="busy" @click="mutate(entry, 'trash')">{{
                          t('delete')
                        }}</NButton>
                      </template>
                      <NButton
                        v-else
                        size="tiny"
                        :disabled="busy"
                        @click="mutate(entry, 'recover')"
                        >{{ t('recover') }}</NButton
                      >
                      <NButton size="tiny" @click="showHistory(entry)">{{ t('history') }}</NButton>
                    </div>
                  </template>
                  <NotebookEntryTools
                    v-if="!entry.deleted"
                    :entry="entry"
                    :target-patch="validPatch"
                    @open="view"
                    @changed="refresh"
                  />
                  <div class="line-clamp-2 break-words whitespace-pre-wrap opacity-75">
                    {{ entry.content.text }}
                  </div>
                  <div v-if="entry.content.opponentId" class="mt-2 flex items-center gap-2">
                    {{ t('against') }}
                    <ChampionIcon :champion-id="entry.content.opponentId" class="size-6! rounded" />
                    {{ resources.champions.name(entry.content.opponentId) }}
                  </div>
                </NCard>
                <NEmpty
                  v-if="result && !result.total"
                  :description="
                    t(deleted ? 'trashEmpty' : search || opponentId ? 'noEntriesMatch' : 'empty')
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
                    <NButton v-else size="small" type="primary" @click="newEntry(kind ?? 'note')">{{
                      t('create', { kind: t(`kinds.${kind ?? 'note'}`) })
                    }}</NButton>
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
          </template>
        </template>
      </div>
    </NScrollbar>

    <NModal
      :show="!!editing && active"
      preset="card"
      :title="t(editing?.id ? 'edit' : 'newEntry')"
      class="w-200! max-w-[95vw]!"
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
      <NScrollbar style="max-height: 70vh"
        ><EntryBody v-if="viewing" :content="viewing.content" :skills="skills"
      /></NScrollbar>
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
      <NAlert v-if="historyError" type="error">{{ t(historyError) }}</NAlert>
      <NSpin :show="historyLoading">
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
import ChampionDirectory from './ChampionDirectory.vue'
import EntitySelect from './EntitySelect.vue'
import EntryBody from './EntryBody.vue'
import EntryEditor from './EntryEditor.vue'
import PreGameNotebook from './PreGameNotebook.vue'
import NotebookEntryTools from './NotebookEntryTools.vue'
import PracticePanel from './PracticePanel.vue'
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
const active = ref(false)
const tab = ref('library')
const championId = ref<number | null>(null)
const opponentId = ref<number | null>(null)
const summaries = shallowRef<NotebookChampionSummary[]>([])
const summaryLoading = ref(false)
const summaryError = ref(false)
const selectedSummary = computed(() =>
  summaries.value.find((row) => row.championId === championId.value)
)
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
const { resources, catalog, champions, skills, unavailable, reload } =
  useNotebookResources(focusChampion)
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
function selectKind(value: NotebookContent['kind'] | null) {
  kind.value = value
  deleted.value = false
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
async function load() {
  const current = ++generation
  if (!active.value || !championId.value) {
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
  history.value = null
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
  result.value = null
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
</script>
