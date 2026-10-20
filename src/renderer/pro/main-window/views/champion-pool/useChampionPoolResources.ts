import {
  type GameResourceProviderValue,
  provideGameResourceProvider,
  useGameResourceProvider
} from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import type { ResourceCatalog } from '@shared/pro/champion-pool'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'

const assetBase =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default'

export function useChampionPoolResources() {
  const upstream = useGameResourceProvider()
  const league = useLeagueClientStore()
  const api = useInstance(ChampionPoolRenderer)
  const catalog = shallowRef<ResourceCatalog>({ champions: {}, queues: {} })
  const unavailable = ref(false)
  let generation = 0
  async function reload() {
    const current = ++generation
    try {
      const next = await api.resources(upstream.runtime.locale === 'zh-CN' ? 'zh-CN' : 'en')
      if (generation === current) {
        catalog.value = next
        unavailable.value = false
      }
    } catch {
      if (generation === current) unavailable.value = true
    }
  }
  watch(
    () => upstream.runtime.locale,
    () => {
      catalog.value = { champions: {}, queues: {} }
      void reload()
    },
    { immediate: true }
  )
  onScopeDispose(() => {
    generation++
  })
  const resources: GameResourceProviderValue = {
    ...upstream,
    champions: {
      name(id) {
        return (
          league.gameData.champions[id]?.name ||
          catalog.value.champions[id] ||
          upstream.champions.name(id)
        )
      },
      icon(id) {
        if (league.isConnected || id < 0) return upstream.champions.icon(id)
        return { id, source: 'url', iconPath: `${assetBase}/v1/champion-icons/${id}.png` }
      }
    },
    queues: {
      name(id) {
        return (
          league.gameData.queues[id]?.name || catalog.value.queues[id] || upstream.queues.name(id)
        )
      }
    },
    assets: {
      resolve(source) {
        const original = upstream.assets.resolve(source)
        if (original) return original
        const prefix = '/lol-game-data/assets/'
        if (!league.isConnected && source.startsWith(prefix))
          return `${assetBase}/${source.slice(prefix.length).toLowerCase()}`
        return null
      }
    }
  }
  provideGameResourceProvider(resources)
  return { resources, catalog, unavailable, reload }
}
