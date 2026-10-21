<template>
  <div v-if="rows.length" class="flex flex-col gap-1 text-xs" aria-live="polite">
    <span v-for="(row, index) in rows" :key="index">{{ row }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import type { LoadoutDetails } from '@shared/pro/notebook/loadout'
const props = defineProps<{ details: LoadoutDetails }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' }),
  resources = useGameResourceProvider(),
  league = useLeagueClientStore()
const rows = computed(() => {
  const result: string[] = []
  const diff = (field: string, current: string, expected: string) =>
    t('difference', { field, current, expected })
  const runes = props.details.runes
  if (runes) {
    if (!runes.current) result.push(t('noCurrentRunes'))
    else {
      for (const key of ['primaryStyleId', 'subStyleId'] as const) {
        if (runes.current[key] !== runes.expected[key])
          result.push(
            diff(
              t(key),
              league.gameData.perkstyles.styles[runes.current[key]]?.name ??
                String(runes.current[key]),
              league.gameData.perkstyles.styles[runes.expected[key]]?.name ??
                String(runes.expected[key])
            )
          )
      }
      const ordered = (ids: number[]) => [
        ...ids.slice(0, 4),
        ...ids.slice(4, 6).sort((a, b) => a - b),
        ...ids.slice(6)
      ]
      const current = ordered(runes.current.selectedPerkIds),
        expected = ordered(runes.expected.selectedPerkIds)
      expected.forEach((id, index) => {
        if (id !== current[index])
          result.push(
            diff(
              index === 0 ? t('keystone') : t('runeSlot', { index: index + 1 }),
              resources.perks.name(current[index]),
              resources.perks.name(id)
            )
          )
      })
    }
  }
  const spells = props.details.spells
  if (spells) {
    if (
      spells.current.spell1Id === spells.expected.spell2Id &&
      spells.current.spell2Id === spells.expected.spell1Id
    )
      result.push(t('spellsReversed'))
    for (const [slot, key] of [
      ['D', 'spell1Id'],
      ['F', 'spell2Id']
    ] as const) {
      if (spells.current[key] !== spells.expected[key])
        result.push(
          diff(
            slot,
            resources.summonerSpells.name(spells.current[key]),
            resources.summonerSpells.name(spells.expected[key])
          )
        )
    }
  }
  for (const field of props.details.items ?? []) result.push(t(`itemDifferences.${field}`))
  return result
})
</script>
