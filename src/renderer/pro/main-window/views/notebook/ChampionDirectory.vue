<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <NInput
        v-model:value="search"
        class="min-w-48 flex-1"
        clearable
        :placeholder="t('championSearch')"
        :aria-label="t('championSearch')"
      />
      <NCheckbox v-model:checked="recordedOnly">{{ t('recordedOnly') }}</NCheckbox>
      <NSelect v-model:value="sort" class="w-36!" :options="sortOptions" :aria-label="t('sort')" />
    </div>
    <div class="champion-grid">
      <NButton
        v-for="champion in visibleChampions"
        :key="champion.id"
        class="champion-card"
        @click="$emit('select', champion.id)"
      >
        <div class="flex w-full min-w-0 flex-col items-center gap-2">
          <ChampionIcon :champion-id="champion.id" class="size-16! rounded-lg" />
          <span class="w-full truncate text-sm font-bold"
            >{{ champion.name
            }}<span v-if="champion.duplicate" class="ml-1 font-normal opacity-60"
              >#{{ champion.id }}</span
            ></span
          >
          <span
            class="text-xs"
            :class="champion.summary?.total ? 'text-(--la-color-text-primary)' : 'opacity-60'"
            >{{ th(champion.summary?.total ? 'added' : 'add') }}</span
          >
          <span
            class="text-xs"
            :class="champion.summary?.total ? 'text-(--la-color-text-primary)' : 'opacity-50'"
            >{{ t('entryCount', { count: champion.summary?.total ?? 0 }) }}</span
          >
          <span class="text-xs opacity-60">{{
            champion.summary?.updatedAt
              ? t('updated', { date: new Date(champion.summary.updatedAt).toLocaleDateString() })
              : champion.summary?.trash
                ? t('trashCount', { count: champion.summary.trash })
                : t('startHandbook')
          }}</span>
        </div>
      </NButton>
    </div>
    <NEmpty v-if="!loading && !visibleChampions.length" :description="t('noChampions')" />
  </div>
</template>
<script setup lang="ts">
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import type { NotebookChampionSummary } from '@shared/pro/notebook'
import { isChampionNameMatch } from '@shared/utils/string-match'
import { useTranslation } from 'i18next-vue'
import { NButton, NCheckbox, NEmpty, NInput, NSelect } from 'naive-ui'
import { computed, ref } from 'vue'

const props = defineProps<{
  champions: { id: number; name: string; keywords?: string }[]
  summaries: NotebookChampionSummary[]
  loading: boolean
}>()
defineEmits<{ select: [id: number] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: th } = useTranslation(undefined, { keyPrefix: 'pro.handbook' })
const search = ref('')
const recordedOnly = ref(false)
const sort = ref('recent')
const sortOptions = computed(() =>
  ['recent', 'name', 'count'].map((value) => ({ value, label: t(`sorts.${value}`) }))
)
const visibleChampions = computed(() => {
  const summaries = new Map(props.summaries.map((summary) => [summary.championId, summary]))
  // Keep saved champions reachable even when their resource catalog is unavailable.
  const names = new Map(props.champions.map((champion) => [champion.id, champion.name]))
  for (const summary of props.summaries)
    if (!names.has(summary.championId)) names.set(summary.championId, `#${summary.championId}`)
  const keywords = new Map(
    props.champions.map((champion) => [champion.id, champion.keywords ?? champion.name])
  )
  const counts = new Map<string, number>()
  for (const name of names.values()) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...names]
    .map(([id, name]) => ({
      id,
      name,
      duplicate: counts.get(name)! > 1,
      summary: summaries.get(id)
    }))
    .filter(
      (champion) =>
        (!recordedOnly.value || (champion.summary?.total ?? 0) > 0) &&
        (!search.value.trim() ||
          isChampionNameMatch(search.value.trim(), keywords.get(champion.id) ?? champion.name) ||
          String(champion.id) === search.value.trim())
    )
    .sort((a, b) => {
      const order =
        sort.value === 'recent'
          ? (b.summary?.updatedAt ?? 0) - (a.summary?.updatedAt ?? 0)
          : sort.value === 'count'
            ? (b.summary?.total ?? 0) - (a.summary?.total ?? 0)
            : 0
      return order || a.name.localeCompare(b.name)
    })
})
</script>
<style scoped>
.champion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.champion-card {
  height: auto;
  padding: 20px 12px;
  border-radius: 12px;
  background: var(--la-card-surface-90);
}
.champion-card :deep(.n-button__content) {
  width: 100%;
  min-width: 0;
}
</style>
