<template>
  <div class="handbook-workspace">
    <div class="hw-columns">
      <aside class="hw-panel hw-stack">
        <div class="hw-row hw-between">
          <NButton text @click="emit('home')"
            ><h3>{{ t('myChampions') }}</h3></NButton
          ><NButton size="tiny" :aria-label="t('addChampion')" @click="emit('add')">＋</NButton>
        </div>
        <NInput
          v-model:value="search"
          size="small"
          clearable
          :placeholder="t('searchChampions')"
          :aria-label="t('searchChampions')"
        /><NButton
          v-for="hero in owned"
          :key="hero.championId"
          class="hw-entry"
          :class="{ 'hw-selected': hero.championId === championId }"
          :bordered="false"
          @click="emit('select', hero.championId)"
          ><ChampionIcon :champion-id="hero.championId" class="hw-avatar" />
          <div>
            <strong>{{ resources.champions.name(hero.championId) }}</strong>
            <div class="hw-muted">{{ hero.total }} {{ t('entries') }}</div>
          </div></NButton
        >
      </aside>
      <main class="hw-stack">
        <ChampionHero
          :champion-id="championId"
          :expanded="section === 'overview'"
          @loaded="info = $event"
          ><template #action
            ><NButton
              quaternary
              circle
              :aria-label="t('favorite')"
              :aria-pressed="favorite"
              :loading="busy"
              @click="toggleFavorite"
              ><NIcon :component="favorite ? Star24Filled : Star24Regular" /></NButton></template
        ></ChampionHero>
        <div class="hw-row">
          <NButton
            v-for="item in ['overview', 'note', 'combo', 'matchup', 'build', 'practice']"
            :key="item"
            size="small"
            :type="section === item ? 'primary' : 'default'"
            secondary
            @click="emit('section', item)"
            >{{ t(item) }}<small v-if="count(item)" class="count">{{ count(item) }}</small></NButton
          ><slot name="actions" />
        </div>
        <ChampionOverview
          v-if="section === 'overview'"
          :key="championId"
          :champion-id="championId"
          :info="info"
          :revision="revision"
          @section="emit('section', $event)"
          @open="emit('open', $event)"
        /><slot v-else />
      </main>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { NButton, NInput, NIcon } from 'naive-ui'
import { Star24Filled, Star24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import type { HandbookHome, NotebookEntry } from '@shared/pro/notebook'
import type { ChampionInfo } from '@shared/pro/notebook/handbook'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
import ChampionHero from './ChampionHero.vue'
import ChampionOverview from './ChampionOverview.vue'
import './workspace.css'
const props = defineProps<{
  championId: number
  section: string
  revision?: unknown
  champions: { id: number; name: string; keywords?: string }[]
}>()
const emit = defineEmits<{
  select: [id: number]
  section: [section: string]
  add: []
  home: []
  open: [entry: NotebookEntry]
}>()
const api = useInstance(NotebookRenderer),
  resources = useGameResourceProvider(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const home = shallowRef<HandbookHome | null>(null),
  info = shallowRef<ChampionInfo | null>(null),
  search = ref(''),
  failed = ref(false),
  busy = ref(false)
const owned = computed(
  () =>
    home.value?.champions.filter(
      (c) =>
        (c.total || c.added || c.championId === props.championId) &&
        `${resources.champions.name(c.championId)} ${props.champions.find((h) => h.id === c.championId)?.keywords ?? ''} ${c.championId}`
          .toLowerCase()
          .includes(search.value.toLowerCase())
    ) ?? []
)
const favorite = computed(
  () => home.value?.champions.find((c) => c.championId === props.championId)?.favorite ?? false
)
function count(kind: string) {
  const c = home.value?.champions.find((c) => c.championId === props.championId)
  return c && ['note', 'combo', 'matchup', 'build'].includes(kind) ? c[kind as 'note'] : null
}
let generation = 0
async function load() {
  const current = ++generation
  try {
    const result = await api.home()
    if (current === generation) {
      home.value = result
      failed.value = false
    }
  } catch {
    if (current === generation) failed.value = true
  }
}
async function toggleFavorite() {
  busy.value = true
  try {
    await api.favoriteChampion(props.championId, !favorite.value)
    await load()
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
watch(() => props.revision, load, { immediate: true })
onScopeDispose(() => generation++)
useRefreshFeedback(
  () => failed.value,
  () => t('loadFailed')
)
</script>
<style scoped>
main {
  min-width: 0;
}
.count {
  margin-left: 7px;
  opacity: 0.6;
}
aside {
  max-height: 760px;
  overflow: auto;
  gap: 6px;
}
.hw-entry {
  padding: 8px;
  min-height: 58px;
}
</style>
