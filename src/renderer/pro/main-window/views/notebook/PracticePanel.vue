<template>
  <div class="flex flex-col gap-3">
    <div class="flex gap-2">
      <NSelect
        v-model:value="filter"
        clearable
        :options="options"
        :placeholder="t('practiceState')"
      /><NButton @click="load">{{ t('refresh') }}</NButton>
    </div>
    <NAlert v-if="error" type="error">{{ t('conflict') }}</NAlert>
    <NCard
      v-for="item in filtered"
      :key="item.entryId"
      size="small"
      :title="item.entry.content.title"
    >
      <template #header-extra
        ><NButton text @click="emit('open', item.entry)">{{ t('open') }}</NButton></template
      >
      <NTag v-if="item.sourceRevision !== item.entry.revision" type="warning">{{
        t('changed')
      }}</NTag>
      <div class="mt-2 flex gap-3">
        <NSelect v-model:value="item.state" :disabled="busy" :options="options" /><NButton
          :disabled="busy"
          @click="save(item)"
          >{{ t('save') }}</NButton
        >
      </div>
      <NInput
        class="mt-2"
        v-model:value="item.notes"
        :disabled="busy"
        type="textarea"
        :maxlength="10000"
        :placeholder="t('practiceNotes')"
      />
    </NCard>
    <NEmpty v-if="!filtered.length" :description="t('practiceEmpty')" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onScopeDispose } from 'vue'
import { NSelect, NButton, NAlert, NCard, NInput, NEmpty, NTag } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import type { PracticeEntry, NotebookEntry } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../../shared/shards/notebook'
const props = defineProps<{ championId: number | null; active: boolean }>(),
  emit = defineEmits<{ open: [NotebookEntry] }>(),
  api = useInstance(NotebookRenderer),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const entries = ref<PracticeEntry[]>([]),
  error = ref(false),
  busy = ref(false),
  filter = ref<string | null>(null)
const options = computed(() =>
    ['pending', 'practicing', 'mastered'].map((value) => ({ value, label: t(`states.${value}`) }))
  ),
  filtered = computed(() => entries.value.filter((e) => !filter.value || e.state === filter.value))
let generation = 0
const drafts = new Map<string, PracticeEntry>(),
  saved = new Map<string, string>()
const signature = (entry: PracticeEntry) => JSON.stringify([entry.state, entry.notes])
async function load() {
  const g = ++generation
  if (!props.active) return
  for (const entry of entries.value) drafts.set(entry.entryId, entry)
  error.value = false
  try {
    const next = await api.practices(props.championId)
    if (g === generation)
      entries.value = next.map((entry) => {
        const draft = drafts.get(entry.entryId)
        if (draft && signature(draft) !== saved.get(entry.entryId))
          return { ...draft, entry: entry.entry }
        saved.set(entry.entryId, signature(entry))
        drafts.set(entry.entryId, entry)
        return entry
      })
  } catch {
    if (g === generation) error.value = true
  }
}
async function save(item: PracticeEntry) {
  if (busy.value) return
  busy.value = true
  error.value = false
  try {
    await api.savePractice({
      entryId: item.entryId,
      expectedRevision: item.revision,
      sourceRevision: item.entry.revision,
      state: item.state,
      notes: item.notes
    })
    const updated = (await api.practices(item.entry.content.championId)).find(
      (e) => e.entryId === item.entryId
    )
    if (updated) {
      saved.set(updated.entryId, signature(updated))
      drafts.set(updated.entryId, updated)
      entries.value = entries.value.map((e) => (e.entryId === updated.entryId ? updated : e))
    }
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
watch([() => props.championId, () => props.active], load, { immediate: true })
onScopeDispose(() => generation++)
</script>
