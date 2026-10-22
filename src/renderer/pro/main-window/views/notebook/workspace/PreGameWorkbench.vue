<template>
  <div class="handbook-workspace">
    <div class="hw-row hw-between">
      <h2>{{ t('preGame') }}</h2>
      <div class="hw-row">
        <EntitySelect
          v-if="!context"
          v-model:value="manualChampion"
          :options="champions"
          kind="champion"
          :placeholder="t('champion')"
          style="width: 220px"
        /><NTag v-else type="success">{{ t('liveSelection') }}</NTag
        ><NSelect
          v-model:value="playerKey"
          clearable
          :options="players.map((p) => ({ value: key(p), label: `${p.name} · ${p.serverId}` }))"
          :placeholder="t('personalAccount')"
          :aria-label="t('personalAccount')"
          style="width: 240px"
        /><RefreshButton @click="load" />
      </div>
    </div>
    <template v-if="champion"
      ><ChampionHero :champion-id="champion" /><LoadoutPanel v-if="context" />
      <div class="lookup-layout">
        <aside class="hw-panel hw-stack">
          <h3>{{ t('findOpponent') }}</h3>
          <NInput
            v-model:value="search"
            clearable
            :placeholder="t('searchChampions')"
            :aria-label="t('searchChampions')"
          /><NSelect
            v-model:value="rating"
            :options="
              ['all', 'difficult', 'even', 'favorable', 'unrated'].map((value) => ({
                value,
                label: t(value)
              }))
            "
            :aria-label="t('personalRating')"
          /><NSelect
            v-model:value="sort"
            :options="[
              { value: 'games', label: t('games') },
              { value: 'name', label: t('name') }
            ]"
            :aria-label="t('sort')"
          /><NButton
            v-for="hero in opponents"
            :key="hero.id"
            class="hw-entry"
            :class="{ 'hw-selected': opponent === hero.id }"
            :bordered="false"
            @click="opponent = hero.id"
            ><ChampionIcon :champion-id="hero.id" class="hw-avatar" />
            <div class="opponent-label">
              <strong>{{ hero.name }}</strong>
              <div class="hw-muted">
                {{ t(hero.rating) }} · {{ sampleCount(hero.stats?.games) }}
              </div>
              <small>{{ rate(hero.stats?.winRate.value) }}</small>
            </div></NButton
          ><NEmpty
            v-if="!opponents.length"
            :description="context ? t('waitingOpponent') : t('noResults')"
            size="small"
          />
        </aside>
        <main v-if="opponent" class="hw-stack">
          <section class="hw-panel hw-stack">
            <div class="hw-row hw-between">
              <div class="hw-row">
                <ChampionIcon :champion-id="opponent" class="hw-avatar" />
                <h2>{{ resources.champions.name(opponent) }}</h2>
                <NTag>{{ t(opponentRating(opponent)) }}</NTag>
              </div>
              <div>
                <strong>{{ rate(selectedStats?.winRate.value) }}</strong>
                <div class="hw-muted">
                  {{ t('personalWinRate') }} ·
                  {{ sampleCount(selectedStats?.games) }}
                </div>
              </div>
            </div>
            <p class="hw-muted">{{ t('personalDataNotice') }}</p>
            <NAlert v-if="statsReady && (!selectedStats || selectedStats.games < 20)" type="info">{{
              t('smallSample')
            }}</NAlert
            ><NButton size="small" @click="emit('create', champion, opponent)"
              >＋ {{ t('recordMatchup') }}</NButton
            >
          </section>
          <p v-if="truncated" class="hw-muted">{{ t('analysisLimit') }}</p>
          <div class="hw-grid">
            <section class="hw-panel hw-stack">
              <h3>{{ t('myStrategy') }}</h3>
              <template v-for="entry in matchupEntries" :key="entry.id"
                ><NButton text @click="emit('open', entry)">{{ entry.content.title }}</NButton>
                <div v-for="field in ['opening', 'trading', 'caution'] as const" :key="field">
                  <strong>{{ briefT(field) }}</strong>
                  <p class="hw-text">
                    {{ entry.content.matchupPlan?.[field] || t('notRecorded') }}
                  </p>
                </div></template
              ><NEmpty v-if="!matchupEntries.length" size="small" :description="t('noStrategy')" />
            </section>
            <section class="hw-panel hw-stack">
              <h3>{{ t('opponentSkills') }}</h3>
              <ChampionHero :champion-id="opponent" />
              <p class="hw-muted">{{ t('timingNotice') }}</p>
            </section>
            <section class="hw-panel hw-stack">
              <h3>{{ t('buildRunes') }}</h3>
              <div
                v-for="entry in related.filter((e) => e.content.kind === 'build')"
                :key="entry.id"
                class="hw-stack"
              >
                <NButton text @click="emit('open', entry)">{{ entry.content.title }}</NButton
                ><LoadoutSummary :content="entry.content" />
                <div v-for="group in entry.content.groups" :key="group.name" class="hw-row">
                  <small>{{ group.name }}</small
                  ><ItemDisplay
                    v-for="(item, i) in group.items"
                    :key="i"
                    :item-id="item.id"
                    :size="30"
                  />
                </div>
              </div>
              <NEmpty
                v-if="!related.some((e) => e.content.kind === 'build')"
                size="small"
                :description="t('noLinkedBuild')"
              />
            </section>
            <section class="hw-panel hw-stack">
              <h3>{{ t('commonSituations') }}</h3>
              <div
                v-for="(s, i) in matchupEntries.flatMap((e) => e.content.situations ?? [])"
                :key="i"
                class="hw-stack hw-rule"
              >
                <strong>{{ s.title }}</strong>
                <p class="hw-text">{{ s.response }}</p>
              </div>
              <NEmpty
                v-if="!matchupEntries.some((e) => e.content.situations?.length)"
                size="small"
                :description="t('notRecorded')"
              />
            </section>
            <section class="hw-panel hw-stack">
              <h3>{{ t('myNotes') }}</h3>
              <div
                v-for="entry in related.filter((e) => e.content.kind !== 'build')"
                :key="entry.id"
                class="hw-stack hw-rule"
              >
                <NButton text @click="emit('open', entry)">{{ entry.content.title }}</NButton>
                <p class="hw-text">{{ entry.content.text }}</p>
              </div>
              <NEmpty
                v-if="!related.some((e) => e.content.kind !== 'build')"
                size="small"
                :description="t('noEntries')"
              />
            </section>
          </div>
        </main>
        <NEmpty v-else :description="t('selectOpponent')" /></div></template
    ><NEmpty v-else :description="t('selectChampion')" />
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../../shared/composables/query-cache'
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../../shared/components/RefreshButton.vue'
import { ref, shallowRef, computed, watch, onScopeDispose } from 'vue'
import { NButton, NInput, NSelect, NAlert, NEmpty, NTag } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import { listSchema, type NotebookEntry } from '@shared/pro/notebook'
import type { PoolPlayer } from '@shared/pro/champion-pool'
import { matchupQuerySchema, type MatchupStats } from '@shared/pro/champion-pool/matchups'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
import { ChampionPoolRenderer } from '../../../../shared/shards/champion-pool'
import EntitySelect from '../EntitySelect.vue'
import LoadoutSummary from '../LoadoutSummary.vue'
import LoadoutPanel from '../LoadoutPanel.vue'
import { quickContext } from '../quick-context'
import { useNotebookResources } from '../useNotebookResources'
import ChampionHero from './ChampionHero.vue'
import './workspace.css'
const props = defineProps<{ initialChampion: number | null }>(),
  emit = defineEmits<{
    open: [entry: NotebookEntry]
    create: [champion: number, opponent: number]
  }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' }),
  { t: briefT } = useTranslation(undefined, { keyPrefix: 'pro.matchupBrief' }),
  api = useInstance(NotebookRenderer),
  pool = useInstance(ChampionPoolRenderer),
  league = useLeagueClientStore()
const context = computed(() =>
    quickContext(league.isConnected, league.gameflow.phase, league.champSelect.session)
  ),
  manualChampion = ref<number | null>(props.initialChampion),
  champion = computed(() => context.value?.championId ?? manualChampion.value)
const { resources, champions } = useNotebookResources(champion)
const search = ref(''),
  rating = ref('all'),
  sort = ref('games'),
  opponent = ref<number | null>(null),
  players = shallowRef<PoolPlayer[]>([]),
  playerKey = ref<string | null>(null),
  entries = shallowRef<NotebookEntry[]>([]),
  stats = shallowRef<MatchupStats[]>([]),
  failed = ref(false),
  statsFailed = ref(false),
  statsReady = ref(false),
  truncated = ref(false)
const key = (p: PoolPlayer) => JSON.stringify([p.serverId, p.puuid]),
  player = computed(() => players.value.find((p) => key(p) === playerKey.value)),
  rate = (value: number | null | undefined) =>
    value == null ? '—' : `${(value * 100).toFixed(1)}%`
function sampleCount(games?: number) {
  return statsReady.value ? t('sampleGames', { count: games ?? 0 }) : '—'
}
function opponentRating(id: number) {
  return (
    entries.value.find(
      (e) => e.content.kind === 'matchup' && e.content.opponentId === id && e.content.matchupRating
    )?.content.matchupRating ?? 'unrated'
  )
}
const opponents = computed(() =>
  champions.value
    .filter(
      (c) => c.id !== champion.value && (!context.value || context.value.opponents.includes(c.id))
    )
    .map((c) => ({
      ...c,
      rating: opponentRating(c.id),
      stats: stats.value.find((s) => s.opponentId === c.id)
    }))
    .filter(
      (c) =>
        (rating.value === 'all' || c.rating === rating.value) &&
        `${c.name} ${c.keywords} ${c.id}`.toLowerCase().includes(search.value.toLowerCase())
    )
    .sort(
      (a, b) =>
        (sort.value === 'games' ? (b.stats?.games ?? 0) - (a.stats?.games ?? 0) : 0) ||
        a.name.localeCompare(b.name)
    )
)
const selectedStats = computed(() => stats.value.find((s) => s.opponentId === opponent.value)),
  matchupEntries = computed(() =>
    entries.value.filter(
      (e) => e.content.kind === 'matchup' && e.content.opponentId === opponent.value
    )
  ),
  related = computed(() => {
    const ids = new Set(matchupEntries.value.flatMap((e) => e.content.links ?? []))
    return entries.value.filter((e) => e.content.opponentId === opponent.value || ids.has(e.id))
  })
let generation = 0,
  disposed = false
const entryKey = () => JSON.stringify([champion.value, context.value?.opponents])
const statsKey = () => JSON.stringify([champion.value, playerKey.value])
useQueryCache(entryKey, entries, () => [])
useQueryCache(statsKey, stats, () => [])
useQueryCache(statsKey, statsReady, () => false)
useQueryCache(statsKey, truncated, () => false)
useRefreshFeedback(
  () => failed.value,
  () => t('loadFailed')
)
useRefreshFeedback(
  () => statsFailed.value,
  () => t('statsUnavailable')
)
async function load() {
  const current = ++generation
  failed.value = false
  statsFailed.value = false
  if (!champion.value) return
  const id = champion.value
  const account = player.value
  await Promise.allSettled([
    (async () => {
      try {
        let page = 1,
          total = 1
        const all: NotebookEntry[] = []
        while (all.length < total) {
          const next = await api.list(
            listSchema.parse({ championId: id, page, publicOpponents: context.value?.opponents })
          )
          if (current !== generation) return
          all.push(...next.items)
          total = next.total
          if (!next.items.length) break
          page++
        }
        if (current === generation) entries.value = all
      } catch {
        if (current === generation) failed.value = true
      }
    })(),
    (async () => {
      if (!account) return
      try {
        let page = 1,
          total = 1
        const all: MatchupStats[] = []
        let isTruncated = false
        while (all.length < total) {
          const next = await pool.matchups(
            matchupQuerySchema.parse({
              ...account,
              championId: id,
              queueIds: [420],
              pageSize: 100,
              page
            })
          )
          if (current !== generation) return
          all.push(...next.items)
          if (next.truncated) isTruncated = true
          total = next.total
          if (!next.items.length) break
          page++
        }
        if (current === generation) {
          truncated.value = isTruncated
          stats.value = all
          statsReady.value = true
        }
      } catch {
        if (current === generation) statsFailed.value = true
      }
    })()
  ])
}
void pool
  .players()
  .then((p) => {
    if (!disposed) {
      players.value = p
      playerKey.value = p[0] ? key(p[0]) : null
    }
  })
  .catch(() => {
    statsFailed.value = true
  })
watch(
  [champion, () => JSON.stringify(context.value)],
  () => {
    opponent.value = null
    void load()
  },
  { immediate: true }
)
watch(playerKey, load)
watch(opponents, (list) => {
  if (opponent.value && !list.some((c) => c.id === opponent.value)) opponent.value = null
  opponent.value ??= list[0]?.id ?? null
})
onScopeDispose(() => {
  generation++
  disposed = true
})
</script>
<style scoped>
.lookup-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.lookup-layout > aside {
  max-height: 750px;
  overflow: auto;
}
.opponent-label {
  min-width: 0;
  text-align: left;
}
.lookup-layout main {
  min-width: 0;
}
@media (max-width: 850px) {
  .lookup-layout {
    grid-template-columns: 1fr;
  }
  .lookup-layout > aside {
    max-height: 300px;
  }
}
</style>
