<template>
  <NScrollbar class="h-full">
    <div class="flex flex-col gap-4">
      <ExperienceSettings />
      <LoadoutSettings />
      <SettingsSection :title="t('notebookData')">
        <SettingsRow :label="t('exportScope')" :label-width="180">
          <NSelect
            v-model:value="championId"
            clearable
            filterable
            :options="championOptions"
            :placeholder="t('allHeroes')"
            class="min-w-48"
          />
        </SettingsRow>
        <SettingsRow :label="t('notebookTransfer')" :label-width="180"
          ><NotebookTransfer :champion-id="championId" @changed="refresh"
        /></SettingsRow>
      </SettingsSection>
      <SettingsSection :title="t('clientBuild')">
        <SettingsRow :label="t('selectBuild')" :label-width="180"
          ><NSelect
            v-model:value="entryId"
            remote
            filterable
            clearable
            :loading="loading"
            :options="buildOptions"
            :placeholder="t('selectBuild')"
            class="min-w-48"
            @search="searchBuilds"
        /></SettingsRow>
        <SettingsRow :label="t('exportBuild')" :label-width="180"
          ><NButton size="small" :disabled="!entryId" :loading="busy" @click="exportBuild">{{
            t('exportBuild')
          }}</NButton></SettingsRow
        >
        <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
      </SettingsSection>
      <SettingsSection :title="t('proData')"
        ><SettingsRow :label="t('backupRestore')" :label-width="180"><DataPanel /></SettingsRow
      ></SettingsSection>
    </div>
  </NScrollbar>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onScopeDispose } from 'vue'
import { NScrollbar, NSelect, NButton, NAlert, useMessage } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import SettingsSection from '@renderer-shared/components/SettingsSection.vue'
import SettingsRow from '@renderer-shared/components/SettingsRow.vue'
import { useInstance } from '@renderer-shared/shards'
import { listSchema, type NotebookEntry, type NotebookChampionSummary } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../shared/shards/notebook'
import { useChampionPoolResources } from '../views/champion-pool/useChampionPoolResources'
import NotebookTransfer from './NotebookTransfer.vue'
import DataPanel from './DataPanel.vue'
import LoadoutSettings from './LoadoutSettings.vue'
import ExperienceSettings from './ExperienceSettings.vue'
const api = useInstance(NotebookRenderer),
  { resources } = useChampionPoolResources(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' }),
  message = useMessage()
const championId = ref<number | null>(null),
  entryId = ref<string | null>(null),
  summaries = ref<NotebookChampionSummary[]>([]),
  builds = ref<NotebookEntry[]>([]),
  loading = ref(false),
  busy = ref(false),
  error = ref(false)
const championOptions = computed(() =>
    summaries.value
      .filter((s) => s.total > 0)
      .map((s) => ({ value: s.championId, label: resources.champions.name(s.championId) }))
  ),
  buildOptions = computed(() =>
    builds.value.map((e) => ({
      value: e.id,
      label: `${resources.champions.name(e.content.championId)} · ${e.content.title}`
    }))
  )
let generation = 0,
  active = true
async function searchBuilds(search = '') {
  const g = ++generation
  loading.value = true
  try {
    const next = await api.list(listSchema.parse({ kind: 'build', search }))
    if (g === generation) builds.value = next.items
  } catch {
    if (g === generation) error.value = true
  } finally {
    if (g === generation) loading.value = false
  }
}
async function refresh() {
  error.value = false
  try {
    const next = await api.champions()
    if (active) summaries.value = next
    await searchBuilds()
  } catch {
    if (active) error.value = true
  }
}
async function exportBuild() {
  if (!entryId.value || busy.value) return
  busy.value = true
  error.value = false
  try {
    if (await api.exportBuild(entryId.value)) message.success(t('states.saved'))
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
onMounted(refresh)
onScopeDispose(() => {
  active = false
  generation++
})
</script>
