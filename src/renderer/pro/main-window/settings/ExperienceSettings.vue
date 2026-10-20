<template>
  <SettingsSection :title="t('preferences')">
    <SettingsRow :label="t('restore')" :label-width="220"
      ><NSwitch :value="value.restore" :disabled="busy" @update:value="change('restore', $event)"
    /></SettingsRow>
    <SettingsRow :label="t('archive')" :label-width="220"
      ><NSwitch :value="value.archive" :disabled="busy" @update:value="change('archive', $event)"
    /></SettingsRow>
    <NAlert v-if="error" type="warning"
      >{{ t('failed') }} <NButton text @click="load">{{ t('retry') }}</NButton></NAlert
    >
  </SettingsSection>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NSwitch, NAlert, NButton } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import SettingsRow from '@renderer-shared/components/SettingsRow.vue'
import SettingsSection from '@renderer-shared/components/SettingsSection.vue'
import { useInstance } from '@renderer-shared/shards'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useExperienceStore } from '../../shared/shards/experience/store'
const api = useInstance(ExperienceRenderer),
  store = useExperienceStore()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const value = ref({ restore: true, archive: true }),
  busy = ref(true),
  error = ref(false)
async function load() {
  try {
    store.status = await api.status()
    value.value = { ...store.status.preferences }
    error.value = false
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
async function change(key: 'restore' | 'archive', enabled: boolean) {
  busy.value = true
  try {
    await api.preferences({ ...value.value, [key]: enabled })
    await load()
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>
