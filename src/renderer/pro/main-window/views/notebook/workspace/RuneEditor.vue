<template>
  <div class="handbook-workspace">
    <div v-if="catalog.styles.length" class="hw-grid">
      <section class="hw-panel hw-stack">
        <h3>{{ t('primaryRunes') }}</h3>
        <NSelect
          :value="modelValue.primaryStyleId || null"
          :options="catalog.styles.map((s) => ({ value: s.id, label: s.name }))"
          :aria-label="t('primaryRunes')"
          @update:value="primary"
        />
        <div v-for="(slot, index) in primarySlots" :key="index" class="hw-row">
          <NButton
            v-for="id in slot.perks"
            :key="id"
            :type="modelValue.selectedPerkIds[index] === id ? 'primary' : 'default'"
            :title="name(id)"
            :aria-label="name(id)"
            :aria-pressed="modelValue.selectedPerkIds[index] === id"
            @click="perk(index, id)"
            ><LcuImage :src="icon(id)" class="rune-icon" :alt="name(id)"
          /></NButton>
        </div>
      </section>
      <section class="hw-panel hw-stack">
        <h3>{{ t('secondaryRunes') }}</h3>
        <NSelect
          :value="modelValue.subStyleId || null"
          :options="
            catalog.styles
              .filter((s) => primaryStyle?.allowedSubStyles.includes(s.id))
              .map((s) => ({ value: s.id, label: s.name }))
          "
          :aria-label="t('secondaryRunes')"
          @update:value="secondary"
        />
        <div v-for="(slot, index) in secondarySlots" :key="index" class="hw-row">
          <NButton
            v-for="id in slot.perks"
            :key="id"
            :type="modelValue.selectedPerkIds.slice(4, 6).includes(id) ? 'primary' : 'default'"
            :title="name(id)"
            :aria-label="name(id)"
            :aria-pressed="modelValue.selectedPerkIds.slice(4, 6).includes(id)"
            @click="subPerk(index, id)"
            ><LcuImage :src="icon(id)" class="rune-icon" :alt="name(id)"
          /></NButton>
        </div>
        <h3>{{ t('statShards') }}</h3>
        <div v-for="(slot, index) in statSlots" :key="index" class="hw-row">
          <NButton
            v-for="id in slot.perks"
            :key="id"
            :type="modelValue.selectedPerkIds[index + 6] === id ? 'primary' : 'default'"
            :aria-label="name(id)"
            :title="name(id)"
            @click="perk(index + 6, id)"
            ><LcuImage :src="icon(id)" class="rune-icon" :alt="name(id)"
          /></NButton>
        </div>
      </section>
    </div>
    <NAlert v-if="catalog.styles.length && !valid" type="warning">{{ t('completeRunes') }}</NAlert>
  </div>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import { computed, shallowRef, ref, watch, onScopeDispose } from 'vue'
import { NButton, NAlert, NSelect } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import LcuImage from '@renderer-shared/components/LcuImage.vue'
import { validRunes, type NotebookRunes } from '@shared/pro/notebook/loadout'
import type { RuneCatalog } from '@shared/pro/notebook/handbook'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
const props = defineProps<{ modelValue: NotebookRunes }>(),
  emit = defineEmits<{ 'update:modelValue': [value: NotebookRunes] }>()
const api = useInstance(NotebookRenderer),
  resources = useGameResourceProvider(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const catalog = shallowRef<RuneCatalog>({ styles: [], perks: [] }),
  failed = ref(false),
  locale = computed(() => (resources.runtime.locale === 'zh-CN' ? 'zh-CN' : 'en'))
const primaryStyle = computed(() =>
    catalog.value.styles.find((s) => s.id === props.modelValue.primaryStyleId)
  ),
  subStyle = computed(() => catalog.value.styles.find((s) => s.id === props.modelValue.subStyleId))
const primarySlots = computed(
    () =>
      primaryStyle.value?.slots.filter(
        (s) => s.type === 'kKeyStone' || s.type === 'kMixedRegularSplashable'
      ) ?? []
  ),
  secondarySlots = computed(
    () => subStyle.value?.slots.filter((s) => s.type === 'kMixedRegularSplashable') ?? []
  ),
  statSlots = computed(() => primaryStyle.value?.slots.filter((s) => s.type === 'kStatMod') ?? [])
const valid = computed(() =>
  validRunes(props.modelValue, Object.fromEntries(catalog.value.styles.map((s) => [s.id, s])))
)
const name = (id: number) => catalog.value.perks.find((p) => p.id === id)?.name ?? String(id),
  icon = (id: number) => catalog.value.perks.find((p) => p.id === id)?.iconPath
let generation = 0
async function load() {
  const current = ++generation
  failed.value = false
  try {
    const next = await api.runes(locale.value)
    if (current === generation) catalog.value = next
  } catch {
    if (current === generation) failed.value = true
  }
}
function primary(id: number) {
  const s = catalog.value.styles.find((s) => s.id === id)
  if (s)
    emit('update:modelValue', {
      primaryStyleId: id,
      subStyleId: s.defaultSubStyle,
      selectedPerkIds: [...s.defaultPerks]
    })
}
function secondary(id: number) {
  const s = catalog.value.styles.find((s) => s.id === id)
  if (!s) return
  const slots = s.slots.filter((s) => s.type === 'kMixedRegularSplashable'),
    ids = [...props.modelValue.selectedPerkIds]
  ids[4] = slots[0].perks[0]
  ids[5] = slots[1].perks[0]
  emit('update:modelValue', { ...props.modelValue, subStyleId: id, selectedPerkIds: ids })
}
function perk(index: number, id: number) {
  const ids = [...props.modelValue.selectedPerkIds]
  ids[index] = id
  emit('update:modelValue', { ...props.modelValue, selectedPerkIds: ids })
}
function subPerk(slot: number, id: number) {
  const ids = [...props.modelValue.selectedPerkIds],
    same = [4, 5].find((i) => secondarySlots.value[slot].perks.includes(ids[i]))
  if (same !== undefined) ids[same] = id
  else {
    ids[4] = ids[5]
    ids[5] = id
  }
  emit('update:modelValue', { ...props.modelValue, selectedPerkIds: ids })
}
api.onResourcesChanged(({ key, failed: error }) => {
  if (key !== `runes:${locale.value}`) return
  if (error) failed.value = true
  else void load()
})
watch(locale, load, { immediate: true })
onScopeDispose(() => generation++)

useRefreshFeedback(
  () => failed.value,
  () => t('loadFailed')
)
</script>
<style scoped>
.rune-icon {
  width: 30px;
  height: 30px;
}
.hw-row :deep(.n-button) {
  padding: 5px;
  height: 40px;
}
</style>
