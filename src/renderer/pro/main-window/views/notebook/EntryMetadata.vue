<template>
  <div class="flex flex-col gap-3">
    <span class="text-sm">{{ t('tags') }}</span>
    <NDynamicTags v-model:value="tags" :max="20" />
    <NInput
      v-model:value="content.confirmedPatch"
      :maxlength="20"
      :placeholder="t('patch')"
      :aria-label="t('patch')"
      clearable
      @blur="normalizePatch"
    />
    <NSelect
      v-if="content.kind === 'build'"
      v-model:value="content.mapId"
      :options="[
        { value: 11, label: t('rift') },
        { value: 12, label: t('aram') }
      ]"
      :placeholder="t('map')"
    />
    <NSelect
      v-model:value="links"
      multiple
      filterable
      remote
      :loading="loading && !options.length"
      :options="options"
      :placeholder="t('links')"
      :max-tag-count="3"
      @search="search"
    />
  </div>
</template>
<script setup lang="ts">
import { useNotification } from 'naive-ui'
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { NDynamicTags, NInput, NSelect } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { listSchema, type NotebookContent } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../../shared/shards/notebook'
const props = defineProps<{ content: NotebookContent; entryId?: string | null }>()
const api = useInstance(NotebookRenderer),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const tags = computed({
  get: () => props.content.tags ?? [],
  set: (value) => (props.content.tags = value.map((v) => v.trim().slice(0, 40)).filter(Boolean))
})
const links = computed({
  get: () => props.content.links ?? [],
  set: (value) => (props.content.links = value.slice(0, 30))
})
const options = ref<{ label: string; value: string }[]>([]),
  loading = ref(false)
let generation = 0
const notification = useNotification()
async function search(text = '') {
  const gen = ++generation
  loading.value = true
  try {
    const page = await api.list(listSchema.parse({ search: text }))
    const selected = await Promise.all(links.value.map((id) => api.get(id).catch(() => null)))
    if (gen === generation)
      options.value = [
        ...new Map(
          [...selected.filter((e) => e !== null), ...page.items]
            .filter((e) => e.id !== props.entryId)
            .map((e) => [e.id, { value: e.id, label: e.content.title }])
        ).values()
      ]
  } catch {
    if (gen === generation) notification.warning({ title: t('failed'), duration: 4000 })
  } finally {
    if (gen === generation) loading.value = false
  }
}
function normalizePatch() {
  if (!props.content.confirmedPatch?.trim()) props.content.confirmedPatch = null
}
onMounted(() => search())
onScopeDispose(() => generation++)
</script>
