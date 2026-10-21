<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">{{ t('runes') }}</span>
      <NButton size="small" :loading="capturing" :disabled="!league.isConnected" @click="capture">{{
        t('captureRunes')
      }}</NButton>
      <NButton
        v-if="!content.runes"
        size="small"
        :disabled="!canEdit"
        @click="content.runes = { primaryStyleId: 0, subStyleId: 0, selectedPerkIds: [] }"
        >{{ t('configureRunes') }}</NButton
      >
      <NButton v-else size="small" @click="content.runes = null">{{ t('removeRunes') }}</NButton>
    </div>
    <RuneV2Edit v-if="content.runes && canEdit" v-model:page="content.runes" />
    <LoadoutSummary v-else-if="content.runes" :content="{ runes: content.runes }" />
    <NAlert v-if="failed" type="error">{{ t('captureFailed') }}</NAlert>
    <div class="flex flex-wrap items-center gap-2">
      <NCheckbox
        :checked="!!content.spells"
        @update:checked="
          (enabled) => (content.spells = enabled ? { spell1Id: 4, spell2Id: 12 } : null)
        "
        >{{ t('spells') }}</NCheckbox
      >
      <template v-if="content.spells">
        <span>D</span>
        <EntitySelect
          v-model:value="content.spells.spell1Id"
          class="min-w-40 flex-1"
          :options="catalog.spells"
          :placeholder="t('spellD')"
        />
        <span>F</span>
        <EntitySelect
          v-model:value="content.spells.spell2Id"
          class="min-w-40 flex-1"
          :options="catalog.spells"
          :placeholder="t('spellF')"
        />
        <NButton size="small" @click="swap">{{ t('swap') }}</NButton>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import { NButton, NCheckbox, NAlert } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import RuneV2Edit from '@main-window/views/automation/components/auto-champ-config/RuneV2Edit.vue'
import type { NotebookContent, NotebookCatalog } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import EntitySelect from './EntitySelect.vue'
import LoadoutSummary from './LoadoutSummary.vue'
const props = defineProps<{ content: NotebookContent; catalog: NotebookCatalog }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' })
const api = useInstance(NotebookRenderer),
  league = useLeagueClientStore()
const canEdit = computed(() => league.gameData.perkstyles.schemaVersion === 2)
const capturing = ref(false),
  failed = ref(false)
let disposed = false
async function capture() {
  const content = props.content
  capturing.value = true
  failed.value = false
  try {
    const runes = await api.captureRunes()
    if (!disposed && props.content === content) content.runes = runes
  } catch {
    if (!disposed) failed.value = true
  } finally {
    capturing.value = false
  }
}
function swap() {
  const spells = props.content.spells
  if (spells) [spells.spell1Id, spells.spell2Id] = [spells.spell2Id, spells.spell1Id]
}
onScopeDispose(() => {
  disposed = true
})
</script>
