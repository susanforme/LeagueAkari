<template>
  <NSelect
    :value="value"
    :size="size"
    :options="selectOptions"
    :render-label="renderLabel"
    filterable
    clearable
    :placeholder="placeholder"
    :aria-label="placeholder"
    @update:value="$emit('update:value', $event)"
  />
</template>
<script setup lang="ts">
import LcuImage from '@renderer-shared/components/LcuImage.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { NSelect, type SelectOption } from 'naive-ui'
import { computed, h } from 'vue'
const props = defineProps<{
  size?: 'small' | 'medium' | 'large'
  value: number | null
  options: { id: number; name: string; iconPath?: string }[]
  kind?: 'champion' | 'asset'
  placeholder: string
}>()
defineEmits<{ 'update:value': [value: number | null] }>()
const selectOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const option of props.options) counts.set(option.name, (counts.get(option.name) ?? 0) + 1)
  return props.options.map((option) => ({
    label: counts.get(option.name)! > 1 ? `${option.name} (${option.id})` : option.name,
    value: option.id,
    iconPath: option.iconPath
  }))
})
function renderLabel(option: SelectOption) {
  return h('span', { class: 'flex items-center gap-2' }, [
    props.kind === 'champion'
      ? h(ChampionIcon, { championId: Number(option.value), class: 'size-6! rounded' })
      : h(LcuImage, {
          src: String(option.iconPath ?? ''),
          class: 'size-6 rounded',
          alt: String(option.label)
        }),
    String(option.label)
  ])
}
</script>
