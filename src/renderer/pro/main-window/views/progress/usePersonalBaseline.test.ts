import type { Insights } from '@shared/pro/progress'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { usePersonalBaseline } from './usePersonalBaseline'

const environment = vi.hoisted(() => ({
  activate: () => {},
  deactivate: () => {},
  insights: vi.fn()
}))
vi.mock('vue', async (load) => ({
  ...(await load<typeof import('vue')>()),
  onActivated: (callback: () => void) => {
    environment.activate = callback
  },
  onDeactivated: (callback: () => void) => {
    environment.deactivate = callback
  }
}))
vi.mock('@renderer-shared/shards', () => ({ useInstance: () => environment }))
vi.mock('../../../shared/shards/progress', () => ({ ProgressRenderer: {} }))
let scope: ReturnType<typeof effectScope>
const result = (scanned: number): Insights => ({ scanned, truncated: false, metrics: [] })
const flush = async () => {
  await nextTick()
  await nextTick()
}
beforeEach(() => {
  vi.clearAllMocks()
  scope = effectScope()
})
afterEach(() => scope.stop())

it('automatically reads local insights once on entry without an analysis action', async () => {
  environment.insights.mockResolvedValue(result(5))
  const state = scope.run(() => usePersonalBaseline(ref('one'), ref(false)))!
  environment.activate()
  await flush()
  expect(environment.insights).toHaveBeenCalledExactlyOnceWith('one', false)
  expect(state.insights.value).toEqual(result(5))
})

it('discards a previous match response after switching reports', async () => {
  let resolve!: (value: Insights) => void
  environment.insights.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const id = ref('one')
  const state = scope.run(() => usePersonalBaseline(id, ref(false)))!
  environment.insights.mockResolvedValue(result(7))
  id.value = 'two'
  await flush()
  resolve(result(99))
  await flush()
  expect(state.insights.value).toEqual(result(7))
})

it('ignores pending work while inactive and refreshes local data on return', async () => {
  let resolve!: (value: Insights) => void
  environment.insights.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const id = ref('one')
  const state = scope.run(() => usePersonalBaseline(id, ref(false)))!
  environment.deactivate()
  id.value = 'two'
  resolve(result(99))
  await flush()
  expect(state.insights.value).toBeNull()
  expect(environment.insights).toHaveBeenCalledTimes(1)
  environment.insights.mockResolvedValue(result(8))
  environment.activate()
  await flush()
  expect(state.insights.value).toEqual(result(8))
})

it('exposes history failures instead of presenting them as an empty baseline', async () => {
  environment.insights.mockRejectedValue(new Error('database unavailable'))
  const state = scope.run(() => usePersonalBaseline(ref('one'), ref(false)))!
  await flush()
  expect(state.error.value).toBe(true)
  expect(state.loading.value).toBe(false)
  expect(state.insights.value).toBeNull()
})
