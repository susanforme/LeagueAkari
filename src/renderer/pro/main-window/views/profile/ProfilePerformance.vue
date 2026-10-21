<template>
  <div class="performance-grid">
    <section class="profile-panel">
      <div class="panel-heading">
        <h2 class="profile-section-title">{{ t('dashboard.recentMatches') }}</h2>
        <div class="flex items-center gap-3">
          <NButton text size="small" @click="openMatches()"
            >{{ t('dashboard.viewAll') }} <NIcon :component="ArrowRight20Regular" class="ml-1"
          /></NButton>
        </div>
      </div>

      <NSpin :show="loading && !recent">
        <ProfileMatchRows
          v-if="recent?.items.length"
          :games="recent.items"
          :puuid="player.puuid"
          :server-id="player.serverId"
          @review="review"
        />
        <NEmpty v-else-if="recent" class="py-12" :description="t('activity.empty')" />
      </NSpin>
    </section>
    <section class="profile-panel">
      <div class="panel-heading">
        <h2 class="profile-section-title">
          {{ t('dashboard.champions') }}
          <span class="period-label">{{ t('dashboard.last30Days') }}</span>
        </h2>
        <NButton text size="small" @click="toggleChampions">
          {{ t(allChampions ? 'dashboard.showLess' : 'dashboard.viewAll') }}
          <NIcon :component="ArrowRight20Regular" class="ml-1" />
        </NButton>
      </div>
      <div class="champion-head profile-muted">
        <span>{{ t('dashboard.champion') }}</span
        ><span>{{ t('activity.games') }}</span
        ><span>{{ t('activity.winRate') }}</span
        ><span>KDA</span>
      </div>
      <NSpin :show="loading && !champions">
        <NScrollbar :style="allChampions ? { maxHeight: '320px' } : undefined">
          <NButton
            v-for="champion in champions?.items"
            :key="champion.championId ?? 0"
            text
            class="champion-row"
            @click="
              router.push({
                name: CHAMPION_POOL_ROUTE,
                query: { champion: champion.championId, queues: '420,440' }
              })
            "
          >
            <div class="champion-columns">
              <div class="champion-name">
                <ChampionIcon
                  :champion-id="champion.championId ?? -1"
                  class="size-8! rounded"
                /><span>{{
                  champion.championId
                    ? resources.champions.name(champion.championId)
                    : t('dashboard.unknownChampion')
                }}</span>
              </div>
              <div class="champion-games">
                <span>{{ champion.games }}</span
                ><NProgress
                  type="line"
                  :percentage="(champion.games / Math.max(1, champions!.filteredMatches)) * 100"
                  :show-indicator="false"
                  :height="6"
                  :color="theme.successColor"
                />
              </div>
              <strong>{{
                champion.winRate.value === null
                  ? '—'
                  : `${(champion.winRate.value * 100).toFixed(1)}%`
              }}</strong
              ><span>{{ champion.kda.value?.toFixed(1) ?? '—' }}</span>
            </div>
          </NButton>
        </NScrollbar>
        <NEmpty
          v-if="champions && !champions.items.length"
          class="py-12"
          :description="t('activity.empty')"
        />
      </NSpin>
      <NPagination
        v-if="allChampions"
        v-model:page="championPage"
        :page-size="20"
        :item-count="champions?.totalChampions ?? 0"
        :disabled="loading"
        class="mx-5 my-3 justify-end"
      />
      <div v-if="champions?.truncated" class="profile-muted px-5 pb-3 text-xs">
        {{ t('activity.truncated') }}
      </div>
    </section>
  </div>
  <NModal
    v-model:show="showMatches"
    preset="card"
    :title="matchTitle"
    class="profile-matches-modal"
    style="width: min(1000px, 94vw)"
    :style="modalTheme"
  >
    <NRadioGroup v-model:value="matchQueue" class="mb-3" size="small">
      <NRadioButton :value="0">{{ t('rankedAll') }}</NRadioButton>
      <NRadioButton :value="420">{{ commonT('queueTypes.RANKED_SOLO_5x5') }}</NRadioButton>
      <NRadioButton :value="440">{{ commonT('queueTypes.RANKED_FLEX_SR') }}</NRadioButton>
    </NRadioGroup>
    <NSpin :show="matchesLoading && !matches">
      <NScrollbar style="max-height: 60vh"
        ><ProfileMatchRows
          :games="matches?.items ?? []"
          :puuid="player.puuid"
          :server-id="player.serverId"
          @review="review"
      /></NScrollbar>
      <NEmpty
        v-if="!matchesLoading && !matchesFailed && !matches?.items.length"
        class="py-8"
        :description="t('dashboard.noMatches')"
      />
    </NSpin>
    <NPagination
      v-model:page="page"
      :page-size="20"
      :item-count="matches?.total ?? 0"
      :disabled="matchesLoading"
      class="mt-4 justify-end"
    />
  </NModal>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useRouter } from 'vue-router'
import { useTranslation } from 'i18next-vue'
import {
  NButton,
  NEmpty,
  NIcon,
  NModal,
  NPagination,
  NProgress,
  NScrollbar,
  NSpin,
  NRadioGroup,
  NRadioButton,
  useThemeVars
} from 'naive-ui'
import { ArrowRight20Regular } from '@vicons/fluent'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import {
  CHAMPION_POOL_ROUTE,
  querySchema,
  type PlayerIdentity,
  type PoolResult,
  type PoolStatus
} from '@shared/pro/champion-pool'
import { profileMatchesSchema, type ProfileMatches } from '@shared/pro/profile'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import { ProfileRenderer } from '../../../shared/shards/profile'
import ProfileMatchRows from './ProfileMatchRows.vue'

const props = defineProps<{ player: PlayerIdentity; playerName: string; refreshToken: number }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const { t: commonT } = useTranslation('common')
const matchQueue = ref(0)
const api = useInstance(ProfileRenderer),
  pool = useInstance(ChampionPoolRenderer)
const resources = useGameResourceProvider(),
  theme = useThemeVars(),
  router = useRouter()
const recent = shallowRef<ProfileMatches | null>(null),
  champions = shallowRef<PoolResult | null>(null)
const syncStatus = shallowRef<PoolStatus | null>(null)
const loading = ref(false),
  failed = ref(false),
  syncFailed = ref(false)
const allChampions = ref(false),
  championPage = ref(1)
const showMatches = ref(false),
  page = ref(1),
  matchesLoading = ref(false),
  matchesFailed = ref(false)
const matches = shallowRef<ProfileMatches | null>(null)
const filter = ref<{ championId: number | null; from: number | null; to: number | null }>({
  championId: null,
  from: null,
  to: null
})
const matchTitle = computed(() =>
  [
    t('dashboard.matches'),
    filter.value.championId ? resources.champions.name(filter.value.championId) : '',
    filter.value.from !== null
      ? `${new Date(filter.value.from).toLocaleDateString()} – ${new Date(filter.value.to! - 1).toLocaleDateString()}`
      : ''
  ]
    .filter(Boolean)
    .join(' · ')
)
const modalTheme = computed(() => ({
  '--profile-muted': theme.value.textColor3,
  '--profile-border': theme.value.dividerColor,
  '--profile-win': theme.value.successColor,
  '--profile-loss': theme.value.errorColor
}))
let active = false,
  generation = 0,
  matchGeneration = 0
function monthStart() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - 29)
  return date.getTime()
}
useQueryCache(
  () => JSON.stringify([props.player.serverId, props.player.puuid]),
  recent,
  () => null
)
useQueryCache(
  () =>
    JSON.stringify([
      props.player.serverId,
      props.player.puuid,
      allChampions.value,
      championPage.value
    ]),
  champions,
  () => null
)
useQueryCache(
  () =>
    JSON.stringify([
      props.player.serverId,
      props.player.puuid,
      filter.value,
      matchQueue.value,
      page.value
    ]),
  matches,
  () => null
)
async function load() {
  if (!active) return
  const current = ++generation
  loading.value = true
  failed.value = false
  try {
    const [games, stats, status] = await Promise.all([
      api.matches(profileMatchesSchema.parse(props.player)),
      pool.query(
        querySchema.parse({
          ...props.player,
          queueIds: [420, 440],
          from: monthStart(),
          to: Date.now(),
          pageSize: allChampions.value ? 20 : 5,
          page: championPage.value
        })
      ),
      pool.status()
    ])
    if (current === generation) {
      recent.value = games
      champions.value = stats
      syncStatus.value = status
    }
  } catch {
    if (current === generation) failed.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
function openMatches(
  championId: number | null = null,
  from: number | null = null,
  to: number | null = null
) {
  filter.value = { championId, from, to }
  page.value = 1
  showMatches.value = true
  void loadMatches()
}
function filterPeriod(from: number, to: number, queue = 0) {
  matchQueue.value = queue
  openMatches(null, from, to)
}
defineExpose({ filterPeriod })
async function loadMatches() {
  if (!active || !showMatches.value) return
  const current = ++matchGeneration
  matchesLoading.value = true
  matchesFailed.value = false
  try {
    const result = await api.matches(
      profileMatchesSchema.parse({
        ...props.player,
        ...filter.value,
        queueIds: matchQueue.value ? [matchQueue.value] : [420, 440],
        page: page.value,
        pageSize: 20
      })
    )
    if (current === matchGeneration) matches.value = result
  } catch {
    if (current === matchGeneration) matchesFailed.value = true
  } finally {
    if (current === matchGeneration) matchesLoading.value = false
  }
}
function review(gameId: number) {
  showMatches.value = false
  void router.push({
    name: REVIEW_ROUTE,
    query: { serverId: props.player.serverId, puuid: props.player.puuid, gameId }
  })
}
function toggleChampions() {
  allChampions.value = !allChampions.value
  championPage.value = 1
}
watch([allChampions, championPage], load)
watch(page, loadMatches)
watch(matchQueue, () => {
  page.value = 1
  void loadMatches()
})
watch([() => props.player.serverId, () => props.player.puuid], () => {
  championPage.value = 1
  showMatches.value = false
  matchGeneration++
  void load()
})
watch(() => props.refreshToken, load)
pool.onChanged(() => {
  if (active) {
    void load()
    void loadMatches()
  }
})
function activate() {
  if (!active) {
    active = true
    void load()
  }
}
function deactivate() {
  active = false
  generation++
  matchGeneration++
  showMatches.value = false
}
onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onScopeDispose(deactivate)
useRefreshFeedback(
  () => failed.value || matchesFailed.value || syncFailed.value || syncStatus.value?.sync.error,
  () => t('dashboard.loadFailed')
)
</script>
<style scoped>
.performance-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  gap: 10px;
}
.period-label {
  color: var(--profile-muted);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}
.champion-head,
.champion-columns {
  display: grid;
  grid-template-columns: minmax(115px, 1.3fr) minmax(70px, 1fr) 58px 36px;
  gap: 14px;
  align-items: center;
}
.champion-head {
  padding: 4px 20px 10px;
  font-size: 11px;
}
.champion-row {
  display: flex;
  width: 100%;
  height: auto;
  padding: 6px 20px;
  box-sizing: border-box;
  border-top: 1px solid var(--profile-border);
  border-radius: 0;
  text-align: left;
}
.champion-row :deep(.n-button__content) {
  width: 100%;
  display: block;
}
.champion-row:hover {
  background: rgb(var(--la-card-tint-rgb) / 0.04);
}
.champion-columns {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.champion-columns strong {
  font-weight: 500;
}
.champion-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.champion-name > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.champion-games {
  display: flex;
  align-items: center;
  gap: 8px;
}
.champion-games > span {
  width: 20px;
  flex-shrink: 0;
}
.profile-matches-modal :deep(.profile-muted) {
  color: var(--profile-muted);
}
@container (max-width: 1100px) {
  .performance-grid {
    grid-template-columns: 1fr;
  }
}
</style>
