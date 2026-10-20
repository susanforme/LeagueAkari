import type { Workspace } from '@shared/pro/experience'
import { type Ref, nextTick, watch } from 'vue'
import type { z } from 'zod'

import { useExperienceStore } from '../shards/experience/store'

export function useWorkspaceState<T extends Record<string, unknown>>(
  page: Workspace['route'],
  fields: { [K in keyof T]: Ref<T[K]> },
  schema: z.ZodType<T>
) {
  const store = useExperienceStore()
  const capture = () =>
    Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, (field as Ref).value]))
  const defaults = JSON.parse(JSON.stringify(capture()))
  let applying = false
  watch(
    () => [store.ready, store.revision],
    async () => {
      if (!store.ready) return
      applying = true
      const value = schema.safeParse(store.workspace.pages[page] ?? defaults)
      if (value.success) for (const key in fields) fields[key].value = value.data[key]
      await nextTick()
      applying = false
    },
    { immediate: true, flush: 'sync' }
  )
  watch(
    capture,
    (value) => {
      if (!store.ready || store.restoring || applying || !store.status?.preferences.restore) return
      const parsed = schema.safeParse(value)
      if (parsed.success) store.workspace.pages[page] = JSON.parse(JSON.stringify(parsed.data))
    },
    { deep: true, flush: 'post' }
  )
}
