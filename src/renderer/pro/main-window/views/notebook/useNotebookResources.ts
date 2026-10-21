import { provideGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import type { NotebookCatalog, NotebookSkills } from '@shared/pro/notebook'
import type { RuneCatalog } from '@shared/pro/notebook/handbook'
import { type Ref, computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { NotebookRenderer } from '../../../shared/shards/notebook'
import { useChampionPoolResources } from '../champion-pool/useChampionPoolResources'

export function useNotebookResources(championId: Ref<number | null>) {
  const pool = useChampionPoolResources()
  const api = useInstance(NotebookRenderer)
  const catalog = shallowRef<NotebookCatalog>({ items: [], spells: [] })
  const runes = shallowRef<RuneCatalog>({ styles: [], perks: [] })
  const skills = shallowRef<NotebookSkills>([])
  const unavailable = ref(false)
  const skillsUnavailable = ref(false)
  let generation = 0
  let skillGeneration = 0
  const locale = computed(() => (pool.resources.runtime.locale === 'zh-CN' ? 'zh-CN' : 'en'))
  async function reload() {
    const current = ++generation
    const [next, runeData] = await Promise.allSettled([
      api.catalog(locale.value),
      api.runes(locale.value)
    ])
    if (current !== generation) return
    if (next.status === 'fulfilled') catalog.value = next.value
    if (runeData.status === 'fulfilled') runes.value = runeData.value
    unavailable.value = next.status === 'rejected' || runeData.status === 'rejected'
  }

  async function reloadSkills() {
    const current = ++skillGeneration
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
    [locale, championId],
    () => {
      skills.value = []
    },
    { flush: 'sync' }
  )
  api.onResourcesChanged(({ key, failed }) => {
    if (key === `skills:${locale.value}:${championId.value}`) {
      if (failed) skillsUnavailable.value = true
      else void reloadSkills()
    } else if ([`catalog:${locale.value}`, `runes:${locale.value}`].includes(key)) {
      if (failed) unavailable.value = true
      else void reload()
    }
  })
  watch(
    locale,
    () => {
      catalog.value = { items: [], spells: [] }
      runes.value = { styles: [], perks: [] }
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
    perks: {
      name: (id: number) =>
        runes.value.perks.find((p) => p.id === id)?.name ?? pool.resources.perks.name(id),
      display(id: number) {
        const p = runes.value.perks.find((p) => p.id === id)
        return (
          pool.resources.perks.display(id) ??
          (p
            ? {
                id: p.id,
                name: p.name,
                iconPath: p.iconPath,
                longDescriptionHtml: p.longDesc,
                endOfGameStatDescriptions: p.endOfGameStatDescs
              }
            : null)
        )
      }
    },
    perkStyles: {
      display(id: number) {
        const s = runes.value.styles.find((s) => s.id === id)
        return (
          pool.resources.perkStyles.display(id) ??
          (s ? { id: s.id, name: s.name, iconPath: s.iconPath, tooltip: '' } : null)
        )
      }
    },
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
