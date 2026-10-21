import { useInstance } from '@renderer-shared/shards'
import type { Insights } from '@shared/pro/progress'
import { type Ref, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { useQueryCache } from '../../../shared/composables/query-cache'
import { ProgressRenderer } from '../../../shared/shards/progress'

const snapshots = new Map<string, Insights | null>()

export function usePersonalBaseline(reportId: Ref<string>, allChampions: Ref<boolean>) {
  const api = useInstance(ProgressRenderer)
  const insights = shallowRef<Insights | null>(null)
  const loading = ref(false)
  const error = ref(false)
  let generation = 0
  let active = true

  useQueryCache(
    () => JSON.stringify([reportId.value, allChampions.value]),
    insights,
    () => null,
    snapshots
  )
  async function load() {
    if (!active) return
    const current = ++generation
    loading.value = true
    error.value = false
    try {
      const next = await api.insights(reportId.value, allChampions.value)
      if (current === generation) insights.value = next
    } catch {
      if (current === generation) error.value = true
    } finally {
      if (current === generation) loading.value = false
    }
  }
  watch([reportId, allChampions], load, { immediate: true, flush: 'sync' })
  onActivated(() => {
    if (active) return
    active = true
    void load()
  })
  onDeactivated(() => {
    active = false
    generation++
  })
  onScopeDispose(() => generation++)
  return { insights, loading, error }
}
