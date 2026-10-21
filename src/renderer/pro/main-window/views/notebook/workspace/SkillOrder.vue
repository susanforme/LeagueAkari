<template>
  <div class="skill-order">
    <div class="order-row">
      <span></span><small v-for="level in levels" :key="level">{{ level }}</small>
    </div>
    <div v-for="slot in [1, 2, 3, 4]" :key="slot" class="order-row">
      <SkillIcon :slot="slot" :skills="skills" /><template v-for="level in levels" :key="level"
        ><NButton
          v-if="editable"
          size="tiny"
          :type="modelValue[level - 1] === slot ? 'primary' : 'default'"
          :disabled="level > modelValue.length + 1"
          :aria-label="t('skillLevel', { level, skill: ['Q', 'W', 'E', 'R'][slot - 1] })"
          :aria-pressed="modelValue[level - 1] === slot"
          @click="set(level, slot)"
          >{{ modelValue[level - 1] === slot ? level : '' }}</NButton
        ><span v-else :class="{ chosen: modelValue[level - 1] === slot }">{{
          modelValue[level - 1] === slot ? level : ''
        }}</span></template
      >
    </div>
    <NButton
      v-if="editable"
      size="tiny"
      :disabled="!modelValue.length"
      @click="emit('update:modelValue', modelValue.slice(0, -1))"
      >{{ t('undo') }}</NButton
    >
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import type { NotebookSkills } from '@shared/pro/notebook'
import SkillIcon from '../SkillIcon.vue'
const props = defineProps<{ modelValue: number[]; skills: NotebookSkills; editable?: boolean }>(),
  emit = defineEmits<{ 'update:modelValue': [value: number[]] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const levels = computed(() => Math.max(18, props.modelValue.length))
function set(level: number, slot: number) {
  const next = [...props.modelValue]
  next[level - 1] = slot
  emit('update:modelValue', next)
}
</script>
<style scoped>
.skill-order {
  overflow: auto;
}
.order-row {
  display: grid;
  grid-template-columns: 42px repeat(v-bind(levels), minmax(18px, 1fr));
  gap: 3px;
  align-items: center;
  margin-bottom: 5px;
  min-width: 420px;
}
.order-row > small,
.order-row > span:not(:first-child) {
  text-align: center;
  font-size: 11px;
  height: 24px;
  line-height: 24px;
}
.chosen {
  background: rgba(30, 183, 145, 0.25);
  border-radius: 3px;
  color: #18a77c;
}
.order-row :deep(.n-button) {
  padding: 0;
  min-width: 18px;
}
</style>
