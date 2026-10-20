<template>
  <div class="flex flex-wrap gap-2">
    <NButton size="small" :loading="busy" @click="exportFile">{{ t('export') }}</NButton>
    <NButton size="small" :disabled="busy" @click="read">{{ t('import') }}</NButton>
    <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
    <NModal
      v-model:show="show"
      preset="card"
      :title="t('import')"
      class="w-160! max-w-[95vw]!"
      :mask-closable="!busy"
    >
      <NAlert v-if="error" type="error">{{ t('conflict') }}</NAlert>
      <div v-if="preview" class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-2">
          <NTag>{{
            t('importAdded', {
              count: preview.added - Object.values(choices).filter(Boolean).length
            })
          }}</NTag>
          <NTag>{{ t('importDuplicates', { count: preview.duplicates }) }}</NTag>
          <NTag v-if="preview.missingLinks" type="warning">{{
            t('importMissingLinks', { count: preview.missingLinks })
          }}</NTag>
        </div>
        <div
          v-for="conflict in preview.conflicts"
          :key="conflict.sourceId + conflict.targetId"
          class="flex items-center gap-3"
        >
          <span class="flex-1">{{ conflict.title }}</span>
          <NCheckbox
            :checked="choices[conflict.sourceId] === conflict.targetId"
            @update:checked="
              (value) => (choices[conflict.sourceId] = value ? conflict.targetId : '')
            "
            >{{ t('replace') }}</NCheckbox
          >
        </div>
        <NButton type="primary" :loading="busy" @click="commit">{{ t('confirmImport') }}</NButton>
      </div>
    </NModal>
  </div>
</template>
<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { NButton, NAlert, NModal, NCheckbox, NTag, useMessage } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import type { NotebookBundle, TransferPreview } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../shared/shards/notebook'
const props = defineProps<{ championId: number | null }>(),
  emit = defineEmits<{ changed: [] }>()
const api = useInstance(NotebookRenderer),
  message = useMessage(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const busy = ref(false),
  error = ref(false),
  show = ref(false),
  bundle = shallowRef<NotebookBundle | null>(null),
  preview = shallowRef<TransferPreview | null>(null),
  choices = ref<Record<string, string>>({})
async function exportFile() {
  if (busy.value) return
  busy.value = true
  error.value = false
  try {
    if (await api.exportFile(props.championId)) message.success(t('states.saved'))
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
async function read() {
  if (busy.value) return
  busy.value = true
  error.value = false
  try {
    const value = await api.readImport()
    if (!value) return
    bundle.value = value
    choices.value = {}
    preview.value = await api.transfer({ bundle: value, replacements: [], commit: false })
    show.value = true
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
async function commit() {
  if (busy.value || !bundle.value || !preview.value) return
  busy.value = true
  error.value = false
  try {
    const replacements = preview.value.conflicts
      .filter((c) => choices.value[c.sourceId] === c.targetId)
      .map((c) => ({ sourceId: c.sourceId, targetId: c.targetId, expectedRevision: c.revision }))
    await api.transfer({ bundle: bundle.value, replacements, commit: true })
    show.value = false
    emit('changed')
    message.success(t('states.saved'))
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
</script>
