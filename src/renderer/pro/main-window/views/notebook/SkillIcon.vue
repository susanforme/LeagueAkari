<template>
  <span class="inline-flex items-center gap-1" :title="skill?.name">
    <LcuImage v-if="skill" :src="skill.abilityIconPath" class="size-7 rounded" :alt="skill.name" />
    <span class="font-bold">{{ ['Q', 'W', 'E', 'R'][slot - 1] }}</span>
  </span>
</template>
<script setup lang="ts">
import LcuImage from '@renderer-shared/components/LcuImage.vue'
import type { NotebookSkills } from '@shared/pro/notebook'
import { computed } from 'vue'
const props = defineProps<{ slot: number; skills: NotebookSkills }>()
const skill = computed(() =>
  props.skills.find((s) => s.spellKey === ['q', 'w', 'e', 'r'][props.slot - 1])
)
</script>
