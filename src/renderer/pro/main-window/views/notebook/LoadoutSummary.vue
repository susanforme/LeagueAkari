<template>
  <div v-if="content.runes || content.spells" class="flex flex-wrap items-center gap-3">
    <div v-if="content.runes" class="flex flex-wrap gap-1" :aria-label="t('runes')">
      <PerkDisplay
        v-for="(id, index) in content.runes.selectedPerkIds"
        :key="index"
        :perk-id="id"
        :size="28"
        :title="resources.perks.name(id)"
      />
    </div>
    <div v-if="content.spells" class="flex items-center gap-2">
      <span class="text-xs">D</span
      ><SummonerSpellDisplay :spell-id="content.spells.spell1Id" :size="28" />
      <span class="text-xs">F</span
      ><SummonerSpellDisplay :spell-id="content.spells.spell2Id" :size="28" />
    </div>
  </div>
</template>
<script setup lang="ts">
import PerkDisplay from '@renderer-shared/components/widgets/PerkDisplay.vue'
import SummonerSpellDisplay from '@renderer-shared/components/widgets/SummonerSpellDisplay.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { NotebookContent } from '@shared/pro/notebook'
import { useTranslation } from 'i18next-vue'
defineProps<{
  content: Pick<NotebookContent, 'runes'> & Partial<Pick<NotebookContent, 'spells'>>
}>()
const resources = useGameResourceProvider()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' })
</script>
