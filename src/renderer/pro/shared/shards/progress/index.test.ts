import type { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { ProgressRenderer } from './index'

vi.mock('@renderer-shared/shards/ipc', () => ({ AkariIpcRenderer: class {} }))
vi.mock('@shared/akari-shard', () => ({ Shard: () => () => {}, Dep: () => () => {} }))
it('sends selected Vue match IDs through a structured-clone IPC boundary', async () => {
  const selected = ref([10, 20])
  const call = vi.fn(async (_namespace, _method, payload) => structuredClone(payload))
  const renderer = new ProgressRenderer({ call } as unknown as AkariIpcRenderer)
  await expect(
    renderer.preview({ serverId: 'EUW1', puuid: 'player', gameIds: selected.value })
  ).resolves.toEqual({ serverId: 'EUW1', puuid: 'player', gameIds: [10, 20] })
  expect(call).toHaveBeenCalledOnce()
})
