<template>
  <div v-if="content.runes || content.spells" class="flex flex-wrap items-center gap-3">
    <div v-if="content.runes && detailed" class="rune-details">
      <div
        v-for="(group, i) in [
          content.runes.selectedPerkIds.slice(0, 4),
          content.runes.selectedPerkIds.slice(4, 6),
          content.runes.selectedPerkIds.slice(6)
        ]"
        :key="i"
      >
        <small
          >{{ hw(['primaryRunes', 'secondaryRunes', 'statShards'][i])
          }}<template v-if="i < 2">
            ·
            {{
              resources.perkStyles.display(
                i === 0 ? content.runes.primaryStyleId : content.runes.subStyleId
              )?.name
            }}</template
          ></small
        >
        <div class="flex flex-wrap gap-2">
          <PerkDisplay
            v-for="id in group"
            :key="id"
            :perk-id="id"
            :size="28"
            :title="resources.perks.name(id)"
          />
        </div>
      </div>
    </div>
    <div v-else-if="content.runes" class="flex flex-wrap gap-1" :aria-label="t('runes')">
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
  detailed?: boolean
  content: Pick<NotebookContent, 'runes'> & Partial<Pick<NotebookContent, 'spells'>>
}>()
const { t: hw } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const resources = useGameResourceProvider()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' })
</script>

<style scoped>
.rune-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.rune-details small {
  display: block;
  margin-bottom: 5px;
  font-size: 11px;
  opacity: 0.65;
}
</style>
