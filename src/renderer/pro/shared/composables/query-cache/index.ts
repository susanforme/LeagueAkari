import { type Ref, watch } from 'vue'

// Keep results tied to their query; a failed new query must not display another account's data.
export function useQueryCache<T>(
  key: () => string,
  value: Ref<T>,
  empty: () => T,
  cache = new Map<string, T>()
) {
  const remember = (name: string, data: T) => {
    cache.delete(name)
    cache.set(name, data)
    if (cache.size > 20) cache.delete(cache.keys().next().value!)
  }
  if (cache.has(key())) value.value = cache.get(key())!
  watch(value, (data) => remember(key(), data), { flush: 'sync' })
  watch(
    key,
    (next, previous) => {
      remember(previous, value.value)
      value.value = cache.has(next) ? cache.get(next)! : empty()
    },
    { flush: 'sync' }
  )
  return cache
}
