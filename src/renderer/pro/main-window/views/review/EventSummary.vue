<template>
  <div class="flex min-w-0 items-center gap-2" :title="describe(event)">
    <template v-if="event.type === 'CHAMPION_KILL'">
      <ChampionIcon
        :champion-id="champion(event.killerId)"
        class="size-7! shrink-0 rounded"
        role="img"
        :aria-label="name(event.killerId)"
      />
      <NIcon
        :component="Bolt"
        :size="16"
        class="shrink-0 text-red-500 dark:text-red-400"
        aria-hidden="true"
      />
      <ChampionIcon
        :champion-id="champion(event.victimId)"
        class="size-7! shrink-0 rounded"
        role="img"
        :aria-label="name(event.victimId)"
      />
    </template>
    <ItemDisplay v-else-if="event.itemId" :item-id="event.itemId" :size="28" />
    <NIcon
      v-else
      :component="
        event.type === 'BUILDING_KILL'
          ? BuildingCastle
          : event.type === 'ELITE_MONSTER_KILL'
            ? Flame
            : MapPin
      "
      :size="24"
      class="shrink-0 text-amber-600 dark:text-amber-400"
      aria-hidden="true"
    />
    <span class="min-w-0 break-words">{{ describe(event) }}</span>
  </div>
</template>
<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { Bolt, BuildingCastle, Flame, MapPin } from '@vicons/tabler'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { ReviewAnalysis, ReviewEvent } from '@shared/pro/review'
const props = defineProps<{
  event: ReviewEvent
  participants: ReviewAnalysis['participants']
  describe: (event: ReviewEvent) => string
}>()
const resources = useGameResourceProvider()
const champion = (id?: number) => props.participants.find((p) => p.id === id)?.championId ?? -1
const name = (id?: number) => resources.champions.name(champion(id))
</script>
