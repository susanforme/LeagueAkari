<template>
  <div class="flex flex-col gap-4">
    <NAlert v-if="!context" type="info">{{ t('waitingSelection') }}</NAlert>
    <template v-else>
      <CurrentFocus :champion-id="context.championId" />
      <div class="flex flex-wrap items-center gap-3">
        <ChampionIcon :champion-id="context.championId" class="size-10! rounded" />
        <span class="font-bold">{{ resources.champions.name(context.championId) }}</span>
        <EntitySelect
          v-model:value="opponent"
          class="w-56!"
          :options="opponents"
          kind="champion"
          :placeholder="t('publicOpponents')"
        />
        <NButton size="small" @click="load">{{ t('refresh') }}</NButton>
        <NCheckbox v-model:checked="compact">{{ briefT('title') }}</NCheckbox>
      </div>
      <NAlert v-if="error" type="error">{{ t('loadFailed') }}</NAlert>
      <NAlert v-if="unavailable" type="warning"
        >{{ t('resourcesUnavailable') }}
        <NButton text @click="reload">{{ t('retry') }}</NButton></NAlert
      >
      <NSpin :show="loading">
        <div class="flex flex-col gap-3">
          <NCard
            v-for="entry in result?.items"
            :key="entry.id"
            size="small"
            :title="entry.content.title"
          >
            <template #header-extra
              ><NTag size="small">{{ t(`kinds.${entry.content.kind}`) }}</NTag></template
            >
            <EntryBody :content="entry.content" :skills="skills" :compact="compact" />
          </NCard>
          <NEmpty v-if="result && !result.total" :description="t('quickEmpty')" />
        </div>
      </NSpin>
      <NPagination
        v-if="result && result.total > 30"
        v-model:page="page"
        :page-size="30"
        :item-count="result.total"
      />
    </template>
  </div>
</template>
<script setup lang="ts">
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { listSchema, type NotebookPage } from '@shared/pro/notebook'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NCard, NEmpty, NPagination, NSpin, NTag, NCheckbox } from 'naive-ui'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import EntitySelect from './EntitySelect.vue'
import EntryBody from './EntryBody.vue'
import { quickContext } from './quick-context'
import { useNotebookResources } from './useNotebookResources'
import CurrentFocus from '../../../shared/components/focus-goal/CurrentFocus.vue'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: briefT } = useTranslation(undefined, { keyPrefix: 'pro.matchupBrief' })
const compact = ref(true)
const league = useLeagueClientStore()
const api = useInstance(NotebookRenderer)
const context = computed(() =>
  quickContext(league.isConnected, league.gameflow.phase, league.champSelect.session)
)
const championId = computed(() => context.value?.championId ?? null)
const { resources, skills, unavailable, reload } = useNotebookResources(championId)
const opponent = ref<number | null>(null)
const page = ref(1)
const result = shallowRef<NotebookPage | null>(null)
const loading = ref(false)
const error = ref(false)
let generation = 0
const opponents = computed(() =>
  (context.value?.opponents ?? []).map((id) => ({ id, name: resources.champions.name(id) }))
)
const identity = computed(() =>
  JSON.stringify([league.auth?.pid, league.summoner.me?.puuid, context.value])
)
watch(
  identity,
  () => {
    generation++
    opponent.value = null
    page.value = 1
    result.value = null
  },
  { flush: 'sync' }
)
watch(opponent, () => {
  page.value = 1
})
async function load() {
  const current = ++generation
  result.value = null
  error.value = false
  loading.value = false
  if (!context.value) return
  loading.value = true
  try {
    const next = await api.list(
      listSchema.parse({
        championId: context.value.championId,
        page: page.value,
        publicOpponents: opponent.value ? [opponent.value] : context.value.opponents
      })
    )
    if (current === generation) result.value = next
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch([identity, opponent, page], load, { immediate: true })
onScopeDispose(() => {
  generation++
})
</script>
