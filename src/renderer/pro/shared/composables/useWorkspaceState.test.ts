import { preferencesSchema } from '@shared/pro/experience'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { z } from 'zod'

import { useExperienceStore } from '../shards/experience/store'
import { useWorkspaceState } from './useWorkspaceState'

it('restores account-specific filters, resets absent values, and does not save during restoration', async () => {
  setActivePinia(createPinia())
  const store = useExperienceStore()
  store.status = {
    account: null,
    accountKey: 'first',
    preferences: preferencesSchema.parse({ restore: true, archive: true }),
    reminder: null,
    plan: null,
    values: {
      autoAccept: false,
      autoHonor: false,
      autoMatchmaking: false,
      playAgain: false,
      auxWindow: false,
      opggWindow: false
    },
    scene: null,
    archiveError: false,
    archiving: false
  }
  const scope = effectScope(),
    queue = ref(420)
  scope.run(() =>
    useWorkspaceState('pro-profile', { queue }, z.object({ queue: z.number().int() }))
  )
  store.workspace.pages['pro-profile'] = { queue: 450 }
  store.ready = true
  await nextTick()
  expect(queue.value).toBe(450)
  queue.value = 440
  await nextTick()
  expect(store.workspace.pages['pro-profile']).toEqual({ queue: 440 })
  store.restoring = true
  store.workspace = { route: 'pro-profile', query: {}, pages: {} }
  store.revision++
  await nextTick()
  expect(queue.value).toBe(420)
  expect(store.workspace.pages).toEqual({})
  store.restoring = false
  store.status.preferences.restore = false
  queue.value = 450
  await nextTick()
  expect(store.workspace.pages).toEqual({})
  scope.stop()
})
