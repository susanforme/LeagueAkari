<template>
  <div class="mt-3 flex flex-col gap-3 rounded-lg bg-(--la-card-muted-surface) p-3">
    <LoadoutPanel
      v-if="entry.content.kind === 'build' && (entry.content.runes || entry.content.spells)"
      :key="entry.id"
      :entry="entry"
    />
    <div class="flex flex-wrap items-center gap-3">
      <NTag v-for="tag in entry.content.tags" :key="tag" size="small">{{ tag }}</NTag>
      <NTag v-if="entry.content.confirmedPatch" size="small">{{
        t('reviewed', { patch: entry.content.confirmedPatch })
      }}</NTag>
      <NTag
        v-if="targetPatch && entry.content.confirmedPatch !== targetPatch"
        size="small"
        type="warning"
        >{{
          t(entry.content.confirmedPatch ? 'reviewStates.needsReview' : 'reviewStates.unmarked')
        }}</NTag
      >
      <NButton
        v-if="targetPatch && entry.content.confirmedPatch !== targetPatch"
        size="small"
        :disabled="busy"
        @click="confirmPatch"
        >{{ t('confirmPatch') }}</NButton
      >
      <NButton size="small" secondary :disabled="busy" @click="practice">{{
        t('addPractice')
      }}</NButton>
      <template
        v-if="entry.content.kind === 'build' && entry.content.groups.some((g) => g.items.length)"
      >
        <NButton size="small" :disabled="busy" @click="apply('apply')">{{
          t('applyBuild')
        }}</NButton>
        <NCheckbox :checked="rule.enabled" :disabled="busy" @update:checked="setRule">{{
          t('autoBuild')
        }}</NCheckbox>
      </template>
    </div>
    <div v-if="linked.length" class="flex flex-wrap gap-2">
      <NButton
        v-for="link in linked"
        :key="link.id"
        text
        size="small"
        @click="emit('open', link)"
        >{{ link.content.title }}</NButton
      >
    </div>
    <NAlert v-if="state" :type="state === 'failed' || state === 'conflict' ? 'error' : 'info'">
      {{ state === 'pending' ? t('awaitingConfirmation') : t(`states.${state}`) }}
      <div v-if="state === 'conflict' && entry.content.kind === 'build'" class="mt-2 flex gap-2">
        <NButton size="small" :disabled="busy" @click="apply('new')">{{ t('createCopy') }}</NButton>
        <NButton size="small" :disabled="busy" @click="confirmOverwrite">{{
          t('overwrite')
        }}</NButton>
      </div>
    </NAlert>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, onScopeDispose } from 'vue'
import { NButton, NCheckbox, NTag, NAlert, useDialog, useMessage } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import type { NotebookEntry, BuildApply } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import LoadoutPanel from './LoadoutPanel.vue'
const props = defineProps<{ entry: NotebookEntry; targetPatch?: string | null }>(),
  emit = defineEmits<{ open: [NotebookEntry]; changed: [NotebookEntry] }>(),
  api = useInstance(NotebookRenderer),
  dialog = useDialog(),
  message = useMessage(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const busy = ref(false),
  state = ref(''),
  rule = ref({ enabled: false, status: 'waiting' }),
  linked = ref<NotebookEntry[]>([])
let generation = 0
watch(
  () => props.entry,
  async (entry) => {
    const g = ++generation
    state.value = ''
    try {
      const links = await Promise.all(
        (entry.content.links ?? []).map((id) => api.get(id).catch(() => null))
      )
      const next =
        entry.content.kind === 'build'
          ? await api.buildRule(entry.id)
          : { enabled: false, status: 'waiting' }
      if (g === generation) {
        linked.value = links.filter((e): e is NotebookEntry => e !== null && !e.deleted)
        rule.value = next
        if (next.status !== 'waiting') state.value = next.status
      }
    } catch {
      if (g === generation) state.value = 'failed'
    }
  },
  { immediate: true }
)
async function run(action: () => Promise<unknown>, success: string) {
  if (busy.value) return
  busy.value = true
  state.value = ''
  try {
    await action()
    if (success === 'saved') message.success(t('states.saved'))
    else state.value = success
  } catch (e) {
    state.value = /conflict/.test(String((e as Error).message)) ? 'conflict' : 'failed'
  } finally {
    busy.value = false
  }
}
function confirmPatch() {
  if (props.targetPatch)
    return run(async () => {
      const next = await api.save({
        id: props.entry.id,
        expectedRevision: props.entry.revision,
        content: { ...props.entry.content, confirmedPatch: props.targetPatch }
      })
      emit('changed', next)
    }, 'saved')
  return undefined
}
function practice() {
  return run(async () => {
    const current = (await api.practices(props.entry.content.championId)).find(
      (p) => p.entryId === props.entry.id
    )
    await api.savePractice({
      entryId: props.entry.id,
      expectedRevision: current?.revision ?? 0,
      sourceRevision: props.entry.revision,
      state: current?.state ?? 'pending',
      notes: current?.notes ?? ''
    })
  }, 'saved')
}
async function apply(mode: BuildApply['mode']) {
  let next = 'pending'
  await run(async () => {
    next = (
      await api.applyBuild({
        entryId: props.entry.id,
        expectedRevision: props.entry.revision,
        mode
      })
    ).state
  }, '')
  if (!state.value) state.value = next
  else if (state.value === 'failed') {
    try {
      const result = await api.buildRule(props.entry.id)
      if (result.status === 'pending') state.value = 'pending'
    } catch {
      /* Keep the actionable failure. */
    }
  }
}
function confirmOverwrite() {
  dialog.warning({
    title: t('overwrite'),
    content: t('overwriteQuestion'),
    positiveText: t('overwrite'),
    negativeText: t('cancel'),
    onPositiveClick: () => apply('overwrite')
  })
}
function setRule(value: boolean) {
  return run(async () => {
    await api.setBuildRule(props.entry.id, value)
    rule.value = await api.buildRule(props.entry.id)
  }, 'saved')
}
onScopeDispose(() => generation++)
</script>
