<template>
  <div class="flex flex-col gap-4">
    <div class="detail-toolbar">
      <NButton class="mr-auto" size="small" quaternary @click="$emit('back')">{{
        t('back')
      }}</NButton>
      <NButton
        size="small"
        @click="router.push({ name: NOTEBOOK_ROUTE, query: { champion: champion.championId } })"
        >{{ notebookT('title') }}</NButton
      >
      <NButton size="small" secondary @click="$emit('history')">{{ t('openHistory') }}</NButton>
    </div>
    <section class="champion-summary">
      <div class="champion-identity">
        <ChampionIcon :champion-id="champion.championId ?? -1" class="size-18! rounded" />
        <div>
          <h2>{{ resources.champions.name(champion.championId ?? -1) }}</h2>
          <div class="identity-tags">
            <span>{{
              champion.position === 'UNKNOWN'
                ? t('unknownPosition')
                : common(`positions.${champion.position}`)
            }}</span
            ><span v-if="query?.patch">{{ t('patch') }} {{ query.patch }}</span
            ><span>{{
              query?.queueIds.length
                ? query.queueIds.map((id) => resources.queues.name(id)).join(' · ')
                : t('allQueues')
            }}</span>
          </div>
        </div>
      </div>
      <div class="summary-metric">
        <strong>{{ champion.games }}</strong
        ><small>{{ t('games') }}</small>
      </div>
      <div v-for="key in metricKeys" :key="key" class="summary-metric">
        <strong
          ><MetricValue
            :metric="champion[key]"
            :ratio="key === 'winRate' || key === 'damageShare' || key === 'killParticipation'"
            :kda="key === 'kda'" /></strong
        ><small>{{ t(key) }}</small>
      </div>
    </section>

    <MatchupPanel v-if="query" :query="query" />
    <div class="flex items-center justify-between gap-3">
      <span class="font-bold">{{ t('matchHistory') }}</span>
      <NPagination
        v-if="matches"
        :page="page"
        :page-size="pageSize"
        :item-count="matches.total"
        :page-sizes="[10, 20, 50]"
        show-size-picker
        :disabled="loading"
        @update:page="$emit('update:page', $event)"
        @update:page-size="$emit('update:pageSize', $event)"
      />
    </div>
    <NScrollbar x-scrollable>
      <div class="flex flex-col gap-1">
        <div
          v-for="game in matches?.items ?? []"
          :key="`${player.serverId}:${player.puuid}:${game.gameId}`"
          class="flex flex-col gap-1"
        >
          <div class="flex items-center justify-end gap-2">
            <MatchShare :summary="game" :puuid="player.puuid" />
            <NButton
              size="tiny"
              @click="
                router.push({
                  name: REVIEW_ROUTE,
                  query: { serverId: player.serverId, puuid: player.puuid, gameId: game.gameId }
                })
              "
            >
              {{ reviewT('open') }}
            </NButton>
            <NButton
              size="tiny"
              :loading="creating === game.gameId"
              :disabled="creating !== null"
              @click="createBuild(game)"
              >{{ notebookT('fromMatch') }}</NButton
            >
          </div>
          <MatchCard
            v-model:is-expanded="expanded[game.gameId]"
            :summary="game"
            :puuid="player.puuid"
            :hide-privacy="app.settings.streamerMode"
            :details="details[game.gameId]"
            :loading-details="detailsLoading[game.gameId]"
            @load-details="loadDetails(game.gameId)"
            @navigate-to-summoner-by-puuid="$emit('navigate', $event)"
          />
        </div>
      </div>
    </NScrollbar>
    <NEmpty v-if="matches && !matches.total && !loading" :description="t('empty')" />
  </div>
</template>

<script setup lang="ts">
import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import MatchShare from '../../../shared/components/share-card/MatchShare.vue'
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useNotebookResources } from '../notebook/useNotebookResources'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import type { ChampionStats, PlayerIdentity, PoolMatchPage } from '@shared/pro/champion-pool'
import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { NOTEBOOK_ROUTE } from '@shared/pro/notebook'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { buildFromMatch } from '@shared/pro/notebook/match-build'
import { useTranslation } from 'i18next-vue'
import { NButton, NEmpty, NPagination, NScrollbar } from 'naive-ui'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { importedBuild } from '../notebook/import-draft'

import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import MetricValue from './MetricValue.vue'
import MatchupPanel from './MatchupPanel.vue'
import type { PoolMatchQuery } from '@shared/pro/champion-pool'

const props = defineProps<{
  query: PoolMatchQuery | null
  champion: ChampionStats
  player: PlayerIdentity
  matches: PoolMatchPage | null
  page: number
  pageSize: number
  loading: boolean
}>()
defineEmits<{
  back: []
  history: []
  navigate: [puuid: string]
  'update:page': [page: number]
  'update:pageSize': [size: number]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const { t: common } = useTranslation('common')
const { t: notebookT } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: reviewT } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const router = useRouter()
const creating = ref<number | null>(null)
const { resources, unavailable: assetsUnavailable } = useNotebookResources(ref(null))
const app = useAppCommonStore()
const api = useInstance(ChampionPoolRenderer)
const metricKeys = [
  'winRate',
  'kda',
  'csPerMin',
  'damageShare',
  'killParticipation',
  'visionPerMin'
] as const
const expanded = ref<Record<number, boolean>>({})
const details = shallowRef<Record<number, LcuOrSgpGameDetails>>({})
const detailsLoading = ref<Record<number, boolean>>({})
const failedGameId = ref<number | null>(null)
let generation = 0
watch(
  [() => props.player.serverId, () => props.player.puuid],
  () => {
    generation++
    expanded.value = {}
    details.value = {}
    detailsLoading.value = {}
    failedGameId.value = null
    creating.value = null
  },
  { flush: 'sync' }
)
onScopeDispose(() => {
  generation++
})
async function loadDetails(gameId: number) {
  if (detailsLoading.value[gameId] || details.value[gameId]) return
  const current = generation
  detailsLoading.value[gameId] = true
  failedGameId.value = null
  try {
    const next = await api.details(props.player, gameId)
    if (!next) throw new Error('Match unavailable')
    if (current === generation) details.value = { ...details.value, [gameId]: next }
  } catch {
    if (current === generation) {
      failedGameId.value = gameId
    }
  } finally {
    if (current === generation) detailsLoading.value[gameId] = false
  }
}
async function createBuild(game: LcuOrSgpGameSummary) {
  if (creating.value !== null) return
  const current = generation
  creating.value = game.gameId
  try {
    const extra =
      details.value[game.gameId] ?? (await api.details(props.player, game.gameId).catch(() => null))
    if (current !== generation) return
    importedBuild.value = buildFromMatch(game, { ...props.player, gameId: game.gameId }, extra)
    await router.push({ name: NOTEBOOK_ROUTE })
  } catch {
    if (current === generation) failedGameId.value = game.gameId
  } finally {
    if (current === generation) creating.value = null
  }
}
useRefreshFeedback(
  () => assetsUnavailable.value,
  () => t('resourcesUnavailable')
)
useRefreshFeedback(
  () => failedGameId.value,
  () => t('detailsUnavailable')
)
</script>

<style scoped>
.champion-summary {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 20px;
  border: 1px solid var(--pool-border);
  border-radius: 6px;
  background: var(--pool-surface);
}
.champion-identity {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1;
  min-width: 260px;
}
.champion-identity h2 {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 650;
}
.identity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.identity-tags span {
  background: var(--la-card-muted-surface);
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
}
.summary-metric {
  padding-left: 18px;
  border-left: 1px solid rgb(var(--la-card-border-rgb) / 0.13);
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 65px;
}
.summary-metric strong {
  font-size: 21px;
  font-weight: 650;
}
.summary-metric small {
  opacity: 0.6;
  font-size: 11px;
}
</style>

<style scoped>
.detail-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.detail-toolbar > :first-child {
  margin-right: auto;
}
</style>
