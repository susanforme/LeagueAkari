<template>
  <div class="flex flex-col gap-3">
    <template v-if="!entry">
      <span class="font-medium">{{ t('title') }}</span>
      <NSelect
        v-model:value="selectedId"
        :options="options"
        :loading="loading && !loadedKey"
        :placeholder="t('choose')"
        :aria-label="t('choose')"
      />
      <NPagination v-if="total > 30" v-model:page="page" :item-count="total" :page-size="30" />
      <LoadoutSummary
        v-if="selected"
        :content="{
          ...selected.content,
          spells: selected.content.spells
            ? arrangeFlash(selected.content.spells, status?.flashSlot ?? 'none')
            : null
        }"
      />
      <span v-if="!loading && !loadedKey" class="text-xs opacity-60">{{ t('empty') }}</span>
    </template>
    <div class="flex flex-wrap items-center gap-2">
      <NButton
        type="primary"
        size="small"
        :loading="applying"
        :disabled="!canApply || status?.busy"
        @click="apply('apply')"
        >{{ t('apply') }}</NButton
      >
      <NButton v-if="!entry" size="small" @click="openHandbook">{{ t('handbook') }}</NButton>
      <NButton
        v-if="!entry || status?.context || failed"
        size="small"
        quaternary
        :disabled="applying"
        @click="reload"
        >{{ t('retry') }}</NButton
      >
      <span v-if="entry && !status?.context" class="text-xs opacity-60">{{
        t('selectionOnly')
      }}</span>
    </div>
    <template v-if="status && status.entryId && status.entryId === selected?.id">
      <div class="flex flex-wrap gap-2" aria-live="polite">
        <NTag
          v-for="part in parts"
          :key="part"
          size="small"
          :type="
            status.parts[part] === 'matched'
              ? 'success'
              : status.parts[part] === 'skipped'
                ? 'default'
                : 'warning'
          "
          >{{ t(part) }} · {{ t(`states.${status.parts[part]}`) }}</NTag
        >
      </div>
      <LoadoutDifferences :details="status.details" />
      <NButton
        v-if="canRetry"
        size="small"
        :loading="applying"
        :disabled="!canApply || status.busy || !!status.issue"
        @click="retryFailed"
        >{{ t('retryFailed') }}</NButton
      >
      <NAlert v-if="status.issue" type="warning">{{ t(status.issue) }}</NAlert>
      <span v-if="status.parts.runes === 'noEditablePage'" class="text-xs">{{
        t('noEditablePageHelp')
      }}</span>
      <div v-if="status.parts.items === 'conflict'" class="flex gap-2">
        <NButton size="tiny" :disabled="applying || !canApply" @click="apply('new')">{{
          workshopT('createCopy')
        }}</NButton>
        <NButton size="tiny" :disabled="applying || !canApply" @click="overwrite">{{
          workshopT('overwrite')
        }}</NButton>
      </div>
    </template>
    <NAlert v-if="status?.flash === 'mismatch' || status?.flash === 'failed'" type="warning">{{
      t(status.flash === 'failed' ? 'flashFailed' : 'flashMismatch')
    }}</NAlert>
  </div>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { NAlert, NButton, NPagination, NSelect, NTag, useDialog } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { NOTEBOOK_ROUTE, listSchema, type NotebookEntry } from '@shared/pro/notebook'
import {
  arrangeFlash,
  selectedLoadoutChampion,
  type LoadoutApply,
  type LoadoutStatus
} from '@shared/pro/notebook/loadout'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import LoadoutDifferences from './LoadoutDifferences.vue'
import LoadoutSummary from './LoadoutSummary.vue'
const props = defineProps<{ entry?: NotebookEntry }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' })
const { t: workshopT } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const api = useInstance(NotebookRenderer),
  league = useLeagueClientStore(),
  router = useRouter(),
  dialog = useDialog()
const parts = ['runes', 'spells', 'items'] as const
const status = shallowRef<LoadoutStatus | null>(null),
  entries = shallowRef<NotebookEntry[]>([])
const selectedId = ref<string | null>(null),
  page = ref(1),
  total = ref(0)
const applying = ref(false),
  loading = ref(false),
  failed = ref(false)
const options = computed(() => entries.value.map((e) => ({ value: e.id, label: e.content.title })))
const selected = computed(() => props.entry ?? entries.value.find((e) => e.id === selectedId.value))
const canApply = computed(() => {
  const context = status.value?.context,
    content = selected.value?.content
  return (
    !!context &&
    !!content &&
    content.championId === context.championId &&
    (content.mapId ?? 11) === context.mapId &&
    (!content.position || content.position === context.position) &&
    !!(content.runes || content.spells || content.groups.some((g) => g.items.length))
  )
})
const canRetry = computed(
  () =>
    !!status.value && parts.some((p) => !['matched', 'skipped'].includes(status.value!.parts[p]))
)
let timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0,
  disposed = false,
  active = true
const loadedKey = ref('')
async function refresh() {
  clearTimeout(timer)
  if (disposed || !active) return
  const current = ++generation
  if (!league.isConnected || league.gameflow.phase !== 'ChampSelect') {
    status.value = null
    return
  }
  try {
    const next = await api.loadoutStatus()
    if (disposed || current !== generation) return
    const key = next.context?.key ?? ''
    if (status.value?.context?.key !== next.context?.key) {
      entries.value = []
      selectedId.value = null
      page.value = 1
      total.value = 0
    }
    status.value = next
    if (!props.entry && key && loadedKey.value !== `${key}:${page.value}`) {
      loading.value = true
      const result = await api.list(
        listSchema.parse({
          championId: next.context!.championId,
          kind: 'build',
          buildMapId: next.context!.mapId,
          buildPosition: next.context!.position,
          page: page.value
        })
      )
      if (disposed || current !== generation) return
      const preferred = page.value === 1 ? await api.preferredLoadout(key) : null
      if (disposed || current !== generation) return
      entries.value =
        preferred && !result.items.some((e) => e.id === preferred.id)
          ? [preferred, ...result.items]
          : result.items
      total.value = result.total
      loadedKey.value = `${key}:${page.value}`
      selectedId.value = entries.value.some((e) => e.id === next.entryId)
        ? next.entryId
        : (preferred?.id ?? result.items[0]?.id ?? null)
    }
    failed.value = false
  } catch {
    if (!disposed && current === generation) failed.value = true
  } finally {
    if (!disposed && current === generation) {
      loading.value = false
      timer = setTimeout(refresh, 2000)
    }
  }
}
function application(mode: LoadoutApply['mode']): LoadoutApply | null {
  const entry = selected.value,
    context = status.value?.context
  return entry && context
    ? {
        entryId: entry.id,
        expectedRevision: entry.revision,
        contextKey: context.key,
        mode,
        retry: mode !== 'apply' && status.value?.entryId === entry.id && !status.value.issue
      }
    : null
}
async function apply(mode: LoadoutApply['mode'], request = application(mode)) {
  if (applying.value || disposed || !active || !request) return
  applying.value = true
  failed.value = false
  try {
    await api.applyLoadout(request)
    if (!disposed) await refresh()
  } catch {
    if (!disposed) {
      loadedKey.value = ''
      failed.value = true
    }
  } finally {
    applying.value = false
  }
}
function retryFailed() {
  const request = application('apply')
  if (request) void apply('apply', { ...request, retry: true })
}
function reload() {
  loadedKey.value = ''
  void refresh()
}
function overwrite() {
  const request = application('overwrite')
  if (!request) return
  dialog.warning({
    title: `${workshopT('overwrite')} · ${selected.value?.content.title ?? ''}`,
    content: workshopT('overwriteQuestion'),
    positiveText: workshopT('overwrite'),
    negativeText: workshopT('cancel'),
    onPositiveClick: () => apply('overwrite', request)
  })
}
function openHandbook() {
  void router.push({
    name: NOTEBOOK_ROUTE,
    query: {
      champion: status.value?.context?.championId ?? selected.value?.content.championId,
      kind: 'build'
    }
  })
}
watch(
  () =>
    JSON.stringify([
      league.isConnected,
      league.auth?.pid,
      league.summoner.me?.puuid,
      league.gameflow.phase,
      league.champSelect.session?.id,
      league.champSelect.session?.gameId,
      selectedLoadoutChampion(league.champSelect.session),
      league.gameflow.session?.map.id,
      league.gameflow.session?.map.gameMode
    ]),
  () => {
    status.value = null
    entries.value = []
    selectedId.value = null
    loadedKey.value = ''
    page.value = 1
    void refresh()
  },
  { immediate: true }
)
watch(page, () => void refresh())
onActivated(() => {
  active = true
  void refresh()
})
onDeactivated(() => {
  active = false
  generation++
  clearTimeout(timer)
})
onScopeDispose(() => {
  disposed = true
  generation++
  clearTimeout(timer)
})
useRefreshFeedback(
  () => failed.value,
  () => t('failed')
)
</script>
