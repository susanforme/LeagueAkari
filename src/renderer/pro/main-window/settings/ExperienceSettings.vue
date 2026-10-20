<template>
  <SettingsSection :title="t('preferences')">
    <SettingsRow :label="t('restore')" :label-width="220"
      ><NSwitch :value="value.restore" :disabled="busy" @update:value="change('restore', $event)"
    /></SettingsRow>
    <SettingsRow :label="t('archive')" :label-width="220"
      ><NSwitch :value="value.archive" :disabled="busy" @update:value="change('archive', $event)"
    /></SettingsRow>
    <SettingsRow :label="t('playReminder.enabled')" :label-width="220">
      <NSwitch
        :value="value.reminder.enabled"
        :aria-label="t('playReminder.enabled')"
        :disabled="busy"
        @update:value="changeReminder('enabled', $event)"
      />
    </SettingsRow>
    <template v-if="value.reminder.enabled">
      <SettingsRow
        v-for="key in reminderKeys"
        :key="key"
        :label="t(`playReminder.${key}`)"
        :label-width="220"
      >
        <NInputNumber
          :value="value.reminder[key]"
          :min="0"
          :max="key === 'minutes' ? 1440 : 100"
          :precision="0"
          :disabled="busy"
          :input-props="{ 'aria-label': t(`playReminder.${key}`) }"
          :update-value-on-input="false"
          @update:value="changeReminder(key, $event ?? 0)"
        />
      </SettingsRow>
      <div class="text-xs opacity-60">{{ t('playReminder.disabledThreshold') }}</div>
    </template>
    <NAlert v-if="error" type="warning"
      >{{ t('failed') }} <NButton text @click="load">{{ t('retry') }}</NButton></NAlert
    >
  </SettingsSection>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { preferencesSchema } from '@shared/pro/experience'
import { NSwitch, NAlert, NButton, NInputNumber } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import SettingsRow from '@renderer-shared/components/SettingsRow.vue'
import SettingsSection from '@renderer-shared/components/SettingsSection.vue'
import { useInstance } from '@renderer-shared/shards'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useExperienceStore } from '../../shared/shards/experience/store'
const api = useInstance(ExperienceRenderer),
  store = useExperienceStore()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const reminderKeys = ['games', 'minutes', 'losses'] as const
const value = ref(preferencesSchema.parse({ restore: true, archive: true })),
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
async function changeReminder(
  key: 'enabled' | 'games' | 'minutes' | 'losses',
  next: boolean | number
) {
  busy.value = true
  try {
    await api.preferences({ ...value.value, reminder: { ...value.value.reminder, [key]: next } })
    await load()
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>
