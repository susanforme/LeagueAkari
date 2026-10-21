<template>
  <SettingsSection :title="t('settings')">
    <SettingsRow :label="t('flashSlot')" :label-width="220">
      <NSelect
        :value="value.flashSlot"
        :options="options"
        :disabled="busy || !loaded"
        :aria-label="t('flashSlot')"
        @update:value="save({ ...value, flashSlot: $event })"
      />
    </SettingsRow>
    <SettingsRow :label="t('forceFlash')" :label-width="220">
      <NSwitch
        :value="value.forceFlash"
        :disabled="busy || !loaded || value.flashSlot === 'none'"
        :aria-label="t('forceFlash')"
        @update:value="save({ ...value, forceFlash: $event })"
      />
    </SettingsRow>
    <div class="text-xs opacity-60">{{ t('forceFlashHelp') }}</div>
    <NAlert v-if="failed" type="error"
      >{{ t('settingsFailed') }} <NButton text @click="load">{{ t('retry') }}</NButton></NAlert
    >
  </SettingsSection>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NSelect, NSwitch } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import SettingsSection from '@renderer-shared/components/SettingsSection.vue'
import SettingsRow from '@renderer-shared/components/SettingsRow.vue'
import { useInstance } from '@renderer-shared/shards'
import { loadoutPreferencesSchema, type LoadoutPreferences } from '@shared/pro/notebook/loadout'
import { NotebookRenderer } from '../../shared/shards/notebook'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' })
const api = useInstance(NotebookRenderer),
  value = ref(loadoutPreferencesSchema.parse({})),
  busy = ref(false),
  failed = ref(false),
  loaded = ref(false)
const options = computed(() =>
  ['none', 'D', 'F'].map((slot) => ({ value: slot, label: t(`flashSlots.${slot}`) }))
)
async function load() {
  busy.value = true
  try {
    value.value = await api.loadoutPreferences()
    loaded.value = true
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
async function save(next: LoadoutPreferences) {
  busy.value = true
  try {
    value.value = await api.saveLoadoutPreferences(next)
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>
