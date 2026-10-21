<template>
  <NButton size="small" :loading="loading" :disabled="!available" @click="capture">{{
    t('captureLoadout')
  }}</NButton>
  <NAlert v-if="failed" type="error">{{ t('captureLoadoutFailed') }}</NAlert>
  <NModal
    v-model:show="show"
    preset="card"
    :title="t('capturePreview')"
    class="w-[560px]! max-w-[90vw]"
  >
    <div v-if="snapshot" class="flex flex-col gap-3">
      <LoadoutSummary :content="snapshot" />
      <span v-if="!snapshot.runes" class="text-xs">{{ t('captureNoRunes') }}</span>
      <span v-if="!snapshot.spells" class="text-xs">{{ t('captureNoSpells') }}</span>
      <NSelect
        v-model:value="itemSetId"
        clearable
        :options="snapshot.itemSets.map((s) => ({ value: s.uid, label: s.title }))"
        :placeholder="t('captureItems')"
        :aria-label="t('captureItems')"
      />
      <div
        v-for="(group, index) in selectedSet?.groups"
        :key="index"
        class="flex flex-wrap items-center gap-2"
      >
        <span>{{ group.name }}</span>
        <span v-for="(item, i) in group.items" :key="i"
          >{{ resources.items.display(item.id)?.name ?? String(item.id) }} × {{ item.count }}</span
        >
      </div>
      <NButton
        type="primary"
        :disabled="!snapshot.runes && !snapshot.spells && !selectedSet"
        @click="accept"
        >{{ t('captureAccept') }}</NButton
      >
    </div>
  </NModal>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { NAlert, NButton, NModal, NSelect } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { NotebookContent } from '@shared/pro/notebook'
import { selectedLoadoutChampion, type CapturedLoadout } from '@shared/pro/notebook/loadout'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import LoadoutSummary from './LoadoutSummary.vue'
const props = defineProps<{ content: NotebookContent }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' }),
  api = useInstance(NotebookRenderer),
  league = useLeagueClientStore(),
  resources = useGameResourceProvider()
const available = computed(
  () =>
    league.isConnected &&
    league.gameflow.phase === 'ChampSelect' &&
    selectedLoadoutChampion(league.champSelect.session)?.championId === props.content.championId
)
const snapshot = shallowRef<CapturedLoadout | null>(null),
  itemSetId = ref<string | null>(null),
  show = ref(false),
  loading = ref(false),
  failed = ref(false)
const selectedSet = computed(() => snapshot.value?.itemSets.find((s) => s.uid === itemSetId.value))
let disposed = false,
  target: NotebookContent | null = null
async function capture() {
  target = props.content
  loading.value = true
  failed.value = false
  try {
    const next = await api.captureLoadout(target.championId)
    if (!disposed && props.content === target) {
      snapshot.value = next
      itemSetId.value = null
      show.value = true
    }
  } catch {
    if (!disposed) failed.value = true
  } finally {
    loading.value = false
  }
}
function accept() {
  const next = snapshot.value
  if (!next || props.content !== target) {
    show.value = false
    return
  }
  if (next.runes) props.content.runes = structuredClone(next.runes)
  if (next.spells) props.content.spells = structuredClone(next.spells)
  if (selectedSet.value) props.content.groups = structuredClone(selectedSet.value.groups)
  if (next.context.mapId === 11 || next.context.mapId === 12)
    props.content.mapId = next.context.mapId
  show.value = false
}
onScopeDispose(() => {
  disposed = true
})
</script>
