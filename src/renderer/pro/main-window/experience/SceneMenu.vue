<template>
  <NPopover trigger="click" placement="bottom-end" @update:show="(value) => value && load()">
    <template #trigger
      ><NButton size="tiny" quaternary :title="store.status?.scene ?? t('sceneCustom')"
        ><span class="max-w-32 truncate">{{
          store.status?.scene ?? t('sceneCustom')
        }}</span></NButton
      ></template
    >
    <div class="flex w-80 flex-col gap-3">
      <span class="font-bold">{{ t('scenes') }}</span>
      <div v-for="scene in scenes" :key="scene.name" class="flex gap-2">
        <NButton
          class="flex-1"
          size="small"
          :disabled="busy"
          :type="store.status?.scene === scene.name ? 'primary' : 'default'"
          @click="apply(scene.name)"
          >{{ scene.name }}</NButton
        >
        <NPopconfirm @positive-click="remove(scene.name)"
          ><template #trigger
            ><NButton size="tiny" :disabled="busy">{{ t('delete') }}</NButton></template
          >{{ t('deleteScene') }}</NPopconfirm
        >
      </div>
      <NInput
        v-model:value="name"
        :placeholder="t('sceneName')"
        :aria-label="t('sceneName')"
        :maxlength="40"
      />
      <NButton size="small" :disabled="!name.trim() || busy" @click="save">{{
        t('saveScene')
      }}</NButton>
      <span class="text-xs opacity-60">{{ t('sceneIncludes') }}</span>
      <NAlert v-if="error" type="warning">{{ t('failed') }}</NAlert>
    </div>
  </NPopover>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { NPopover, NButton, NInput, NAlert, NPopconfirm } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import type { Scene } from '@shared/pro/experience'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useExperienceStore } from '../../shared/shards/experience/store'
const api = useInstance(ExperienceRenderer),
  store = useExperienceStore()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const scenes = ref<Scene[]>([]),
  name = ref(''),
  busy = ref(false),
  error = ref(false)
async function load() {
  try {
    scenes.value = await api.scenes()
    store.status = await api.status()
    error.value = false
  } catch {
    error.value = true
  }
}
async function perform(work: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = false
  try {
    await work()
    await load()
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
function save() {
  return perform(async () => {
    const status = await api.status()
    await api.saveScene({ name: name.value.trim(), values: status.values })
    name.value = ''
  })
}
function apply(value: string) {
  return perform(() => api.applyScene(value))
}
function remove(value: string) {
  return perform(() => api.deleteScene(value))
}
</script>
