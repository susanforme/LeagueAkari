<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <NButton size="small" @click="$emit('back')">{{ t('back') }}</NButton>
      <NButton
        size="small"
        @click="router.push({ name: NOTEBOOK_ROUTE, query: { champion: champion.championId } })"
        >{{ notebookT('title') }}</NButton
      >
      <NButton size="small" secondary @click="$emit('history')">{{ t('openHistory') }}</NButton>
    </div>
    <div class="flex flex-wrap items-center gap-5">
      <ChampionIcon :champion-id="champion.championId ?? -1" class="size-14! rounded" />
      <span class="text-base font-bold">{{
        resources.champions.name(champion.championId ?? -1)
      }}</span>
      <div class="flex flex-col gap-1">
        <span class="text-xs opacity-60">{{ t('games') }}</span
        >{{ champion.games }}
      </div>
      <div v-for="key of metricKeys" :key="key" class="flex flex-col gap-1">
        <span class="text-xs opacity-60">{{ t(key) }}</span>
        <MetricValue
          :metric="champion[key]"
          :ratio="key === 'winRate' || key === 'damageShare'"
          :kda="key === 'kda'"
        />
      </div>
    </div>
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
    <NAlert v-if="failedGameId" type="warning" closable @close="failedGameId = null">
      {{ t('detailsUnavailable') }}
      <NButton text size="tiny" @click="retryDetails">{{ t('retry') }}</NButton>
    </NAlert>
    <NScrollbar x-scrollable>
      <div class="flex flex-col gap-1">
        <div
          v-for="game in matches?.items ?? []"
          :key="`${player.serverId}:${player.puuid}:${game.gameId}`"
          class="flex flex-col gap-1"
        >
          <div class="flex justify-end gap-2">
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
import MatchShare from '../../../shared/components/share-card/MatchShare.vue'
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import type { ChampionStats, PlayerIdentity, PoolMatchPage } from '@shared/pro/champion-pool'
import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { NOTEBOOK_ROUTE } from '@shared/pro/notebook'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { buildFromMatch } from '@shared/pro/notebook/match-build'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NEmpty, NPagination, NScrollbar } from 'naive-ui'
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
const { t: notebookT } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: reviewT } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const router = useRouter()
const creating = ref<number | null>(null)
const resources = useGameResourceProvider()
const app = useAppCommonStore()
const api = useInstance(ChampionPoolRenderer)
const metricKeys = ['winRate', 'kda', 'csPerMin', 'damageShare'] as const
const details = shallowRef<Record<number, LcuOrSgpGameDetails>>({})
const detailsLoading = ref<Record<number, boolean>>({})
const failedGameId = ref<number | null>(null)
const failedGames = new Set<number>()
let generation = 0
watch(
  () => [props.player.serverId, props.player.puuid, props.matches],
  () => {
    generation++
    details.value = {}
    detailsLoading.value = {}
    failedGameId.value = null
    failedGames.clear()
    creating.value = null
  },
  { flush: 'sync' }
)
onScopeDispose(() => {
  generation++
})
async function loadDetails(gameId: number) {
  if (detailsLoading.value[gameId] || details.value[gameId] || failedGames.has(gameId)) return
  const current = generation
  detailsLoading.value[gameId] = true
  failedGameId.value = null
  try {
    const next = await api.details(props.player, gameId)
    if (!next) throw new Error('Match unavailable')
    if (current === generation) details.value = { ...details.value, [gameId]: next }
  } catch {
    if (current === generation) {
      failedGames.add(gameId)
      failedGameId.value = gameId
    }
  } finally {
    if (current === generation) detailsLoading.value[gameId] = false
  }
}
function retryDetails() {
  if (failedGameId.value === null) return
  const gameId = failedGameId.value
  failedGames.delete(gameId)
  void loadDetails(gameId)
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
</script>
