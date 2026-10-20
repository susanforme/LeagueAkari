import { provideGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import type { NotebookCatalog, NotebookSkills } from '@shared/pro/notebook'
import { type Ref, computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { NotebookRenderer } from '../../../shared/shards/notebook'
import { useChampionPoolResources } from '../champion-pool/useChampionPoolResources'

export function useNotebookResources(championId: Ref<number | null>) {
  const pool = useChampionPoolResources()
  const api = useInstance(NotebookRenderer)
  const catalog = shallowRef<NotebookCatalog>({ items: [], spells: [] })
  const skills = shallowRef<NotebookSkills>([])
  const unavailable = ref(false)
  const skillsUnavailable = ref(false)
  let generation = 0
  let skillGeneration = 0
  const locale = computed(() => (pool.resources.runtime.locale === 'zh-CN' ? 'zh-CN' : 'en'))
  async function reload() {
    const current = ++generation
    try {
      const next = await api.catalog(locale.value)
      if (current === generation) {
        catalog.value = next
        unavailable.value = false
      }
    } catch {
      if (current === generation) unavailable.value = true
    }
  }
  async function reloadSkills() {
    const current = ++skillGeneration
    skills.value = []
    skillsUnavailable.value = false
    if (!championId.value) return
    try {
      const next = await api.skills(locale.value, championId.value)
      if (current === skillGeneration) skills.value = next
    } catch {
      if (current === skillGeneration) skillsUnavailable.value = true
    }
  }
  watch(
    locale,
    () => {
      catalog.value = { items: [], spells: [] }
      void reload()
    },
    { immediate: true }
  )
  watch([locale, championId], reloadSkills, { immediate: true })
  onScopeDispose(() => {
    generation++
    skillGeneration++
  })
  const items = computed(() => new Map(catalog.value.items.map((item) => [item.id, item])))
  const spells = computed(() => new Map(catalog.value.spells.map((spell) => [spell.id, spell])))
  const resources = {
    ...pool.resources,
    items: {
      display(id: number) {
        const original = pool.resources.items.display(id)
        const item = items.value.get(id)
        return (
          original ??
          (item
            ? {
                ...item,
                descriptionHtml: item.description,
                totalPrice: item.priceTotal,
                from: item.from.flatMap((id) => items.value.get(id) ?? []),
                to: item.to.flatMap((id) => items.value.get(id) ?? [])
              }
            : null)
        )
      }
    },
    summonerSpells: {
      name: (id: number) => spells.value.get(id)?.name ?? pool.resources.summonerSpells.name(id),
      display(id: number) {
        const original = pool.resources.summonerSpells.display(id)
        const spell = spells.value.get(id)
        return original ?? spell ?? null
      }
    }
  }
  provideGameResourceProvider(resources)
  const champions = computed(() =>
    Object.entries(pool.catalog.value.champions)
      .filter(([id]) => Number(id) > 0)
      .map(([id, name]) => ({
        id: Number(id),
        name,
        keywords: pool.catalog.value.championSearch?.[id] ?? name
      }))
  )
  return {
    resources,
    catalog,
    skills,
    champions,
    unavailable: computed(
      () => unavailable.value || skillsUnavailable.value || pool.unavailable.value
    ),
    reload: () => Promise.all([pool.reload(), reload(), reloadSkills()])
  }
}
