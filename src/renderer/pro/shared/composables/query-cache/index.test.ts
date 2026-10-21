import { describe, expect, it } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'

import { useQueryCache } from './index'

describe('query snapshots', () => {
  it('restores cached filters, isolates accounts and retains results during a failed refresh', () => {
    const scope = effectScope()
    scope.run(() => {
      const account = ref('EUW:a'),
        filter = ref('solo')
      const data = shallowRef<string[] | null>(['first'])
      useQueryCache(
        () => JSON.stringify([account.value, filter.value]),
        data,
        () => null
      )
      filter.value = 'flex'
      expect(data.value).toBeNull()
      data.value = ['flex games']
      filter.value = 'solo'
      expect(data.value).toEqual(['first'])
      // A failed refresh does not assign a replacement.
      expect(data.value).toEqual(['first'])
      account.value = 'KR:b'
      expect(data.value).toBeNull()
      account.value = 'EUW:a'
      expect(data.value).toEqual(['first'])
      data.value = ['updated']
      filter.value = 'flex'
      expect(data.value).toEqual(['flex games'])
      filter.value = 'solo'
      expect(data.value).toEqual(['updated'])
    })
    scope.stop()
  })
})
