<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="font-medium">{{ t('title') }}</span>
      <RefreshButton @click="load" />
    </div>

    <NSpin :show="loading && !loaded">
      <NEmpty v-if="loaded && !entries.length" :description="t('empty')" />
      <NCard
        v-for="entry in entries"
        :key="entry.id"
        size="small"
        :title="entry.content.title"
        class="mb-2"
      >
        <EntryBody :content="entry.content" :skills="[]" compact />
        <NButton class="mt-2" text size="tiny" @click="open(entry)">{{ t('edit') }}</NButton>
      </NCard>
    </NSpin>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import { ref, shallowRef, watch, onMounted, onActivated, onDeactivated, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { listSchema, NOTEBOOK_ROUTE, type NotebookEntry } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import EntryBody from '../notebook/EntryBody.vue'
const props = defineProps<{ championId: number; opponentId: number }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.matchupBrief' })
const api = useInstance(NotebookRenderer),
  router = useRouter()
const entries = shallowRef<NotebookEntry[]>([]),
  loaded = ref(false),
  loading = ref(false),
  error = ref(false)
let generation = 0,
  active = false
const cacheKey = () => JSON.stringify([props.championId, props.opponentId])
useQueryCache(cacheKey, entries, () => [])
useQueryCache(cacheKey, loaded, () => false)
async function load() {
  const current = ++generation
  if (!active) return
  loading.value = true
  error.value = false
  try {
    const result = await api.list(
      listSchema.parse({
        championId: props.championId,
        opponentId: props.opponentId,
        kind: 'matchup'
      })
    )
    if (current === generation) {
      entries.value = result.items.slice(0, 3)
      loaded.value = true
    }
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
function open(entry: NotebookEntry) {
  void router.push({
    name: NOTEBOOK_ROUTE,
    query: { champion: props.championId, opponent: props.opponentId, search: entry.content.title }
  })
}
watch([() => props.championId, () => props.opponentId], () => {
  void load()
})
function activate() {
  if (!active) {
    active = true
    void load()
  }
}
function deactivate() {
  active = false
  generation++
  loading.value = false
}
api.onChanged(() => {
  if (active) void load()
})
onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onScopeDispose(deactivate)
useRefreshFeedback(
  () => error.value,
  () => t('failed')
)
</script>
