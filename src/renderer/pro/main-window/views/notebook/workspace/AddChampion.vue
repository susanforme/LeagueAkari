<template>
  <div class="handbook-workspace">
    <div class="hw-row hw-between">
      <div>
        <h2>{{ t('addChampion') }}</h2>
        <p class="hw-muted">{{ t('addDescription') }}</p>
      </div>
      <NButton @click="emit('back')">{{ t('back') }}</NButton>
    </div>

    <div class="add-layout">
      <div class="hw-stack">
        <NInput
          v-model:value="search"
          clearable
          :placeholder="t('searchChampions')"
          :aria-label="t('searchChampions')"
        />
        <div class="hw-row hw-between">
          <div class="hw-row">
            <NButton
              v-for="p in ['', ...positions]"
              :key="p"
              size="small"
              :type="position === p ? 'primary' : 'default'"
              @click="position = p"
              >{{ p ? tn(`positions.${p}`) : t('all') }}</NButton
            >
          </div>
          <NSelect
            v-model:value="sort"
            class="sort"
            :options="[
              { label: t('name'), value: 'name' },
              { label: t('notAdded'), value: 'new' }
            ]"
            :aria-label="t('sort')"
          />
        </div>
        <div class="champion-roster">
          <NButton
            v-for="champion in filtered"
            :key="champion.id"
            class="roster-card"
            :class="{ 'hw-selected': selected === champion.id }"
            :aria-pressed="selected === champion.id"
            @click="selected = champion.id"
            ><ChampionIcon :champion-id="champion.id" class="roster-icon" /><strong>{{
              champion.name
            }}</strong
            ><small :class="{ added: owned.has(champion.id) }">{{
              owned.has(champion.id)
                ? `✓ ${t('added')}`
                : (roles[champion.id] ?? []).map((p) => tn(`positions.${p}`)).join(' · ')
            }}</small></NButton
          >
        </div>
        <NEmpty v-if="!filtered.length" :description="t('noResults')" />
      </div>
      <aside v-if="selected" class="hw-stack">
        <ChampionHero :champion-id="selected" expanded @loaded="info = $event" />
        <section class="hw-panel"><ChampionTraits :info="info" /></section>
        <section class="hw-panel hw-stack">
          <h3>{{ t('addToHandbook') }}</h3>
          <p class="hw-muted">{{ t('addDescription') }}</p>
          <NAlert v-if="saveFailed" type="error">{{ t('saveFailed') }}</NAlert
          ><NButton type="primary" block :loading="busy" @click="add">{{
            owned.has(selected)
              ? t('openHandbook')
              : t('addName', { name: resources.champions.name(selected) })
          }}</NButton>
        </section>
      </aside>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { NButton, NInput, NSelect, NAlert, NEmpty } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { positions, championGuideSchema, type ChampionInfo } from '@shared/pro/notebook/handbook'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
import ChampionHero from './ChampionHero.vue'
import ChampionTraits from './ChampionTraits.vue'
import './workspace.css'
const props = defineProps<{ champions: { id: number; name: string; keywords?: string }[] }>()
const emit = defineEmits<{ back: []; select: [id: number] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' }),
  { t: tn } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const api = useInstance(NotebookRenderer),
  resources = useGameResourceProvider()
const search = ref(''),
  position = ref(''),
  sort = ref('name'),
  selected = ref<number | null>(null),
  info = shallowRef<ChampionInfo | null>(null),
  roles = ref<Record<string, string[]>>({}),
  owned = ref(new Set<number>()),
  failed = ref(false),
  saveFailed = ref(false),
  busy = ref(false)
const locale = computed(() => (resources.runtime.locale === 'zh-CN' ? 'zh-CN' : 'en'))
const filtered = computed(() =>
  props.champions
    .filter(
      (c) =>
        (!position.value || roles.value[c.id]?.includes(position.value)) &&
        `${c.name} ${c.id} ${c.keywords ?? ''}`
          .toLowerCase()
          .includes(search.value.toLowerCase().trim())
    )
    .sort(
      (a, b) =>
        (sort.value === 'new'
          ? Number(owned.value.has(a.id)) - Number(owned.value.has(b.id))
          : 0) || a.name.localeCompare(b.name)
    )
)
let generation = 0,
  disposed = false
async function load() {
  const current = ++generation
  failed.value = false
  const results = await Promise.allSettled([api.home(), api.positions(locale.value)])
  if (current !== generation) return
  const [home, positionData] = results
  if (home.status === 'fulfilled')
    owned.value = new Set(
      home.value.champions.filter((c) => c.total || c.added).map((c) => c.championId)
    )
  if (positionData.status === 'fulfilled') roles.value = positionData.value
  failed.value = results.some((r) => r.status === 'rejected')
}
async function add() {
  if (!selected.value || busy.value) return
  const id = selected.value
  if (owned.value.has(id)) {
    emit('select', id)
    return
  }
  busy.value = true
  saveFailed.value = false
  try {
    const existing = await api.guide(id)
    if (!existing)
      await api.saveGuide(
        championGuideSchema.parse({
          championId: id,
          expectedRevision: 0,
          position: roles.value[id]?.[0] ?? null
        })
      )
    owned.value.add(id)
    if (!disposed) emit('select', id)
  } catch {
    saveFailed.value = true
  } finally {
    busy.value = false
  }
}
api.onResourcesChanged(({ key, failed: error }) => {
  if (key !== `positions:${locale.value}`) return
  if (error) failed.value = true
  else void load()
})
watch(locale, load, { immediate: true })
watch(
  () => props.champions,
  () => {
    selected.value ??= props.champions[0]?.id ?? null
  },
  { immediate: true }
)
onScopeDispose(() => {
  generation++
  disposed = true
})

useRefreshFeedback(
  () => failed.value,
  () => t('loadFailed')
)
</script>
<style scoped>
.add-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr);
  gap: 24px;
}
.champion-roster {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 12px;
}
.roster-card {
  height: 146px;
  padding: 12px;
  background: var(--hw-surface);
  border-radius: 8px;
}
.roster-card :deep(.n-button__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  width: 100%;
}
.roster-icon {
  width: 64px;
  height: 64px;
  border-radius: 6px;
}
.roster-card strong {
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.roster-card small {
  font-size: 11px;
  opacity: 0.7;
}
.roster-card .added {
  color: #16a581;
  opacity: 1;
}
.sort {
  width: 145px;
}
.add-layout aside {
  position: sticky;
  top: 0;
}
@media (max-width: 1000px) {
  .add-layout {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
}
@media (max-width: 780px) {
  .add-layout {
    grid-template-columns: 1fr;
  }
  .add-layout aside {
    position: static;
  }
}
</style>
