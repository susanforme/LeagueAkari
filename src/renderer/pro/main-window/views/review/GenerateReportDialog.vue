<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="t('generate')"
    class="w-210! max-w-[calc(100vw-48px)]!"
    :mask-closable="!generating"
    :closable="!generating"
    :close-on-esc="!generating"
  >
    <div class="flex flex-col gap-4">
      <NSelect
        v-model:value="playerKey"
        :options="playerOptions"
        :placeholder="t('player')"
        :aria-label="t('player')"
        :disabled="generating"
      />
      <NSelect
        v-model:value="gameId"
        :options="matchOptions"
        filterable
        :placeholder="t('chooseMatch')"
        :aria-label="t('chooseMatch')"
        :disabled="generating || loading"
        :loading="loading"
      />
      <div v-if="player" class="flex items-center justify-end gap-3">
        <NButton size="small" :disabled="page === 1 || loading || generating" @click="page--">{{
          t('previous')
        }}</NButton>
        <span>{{ page }}</span>
        <NButton
          size="small"
          :disabled="matches.length < 30 || loading || generating"
          @click="page++"
          >{{ t('next') }}</NButton
        >
      </div>
      <NScrollbar v-if="summary && player" x-scrollable>
        <MatchCard
          :key="`${playerKey}:${gameId}`"
          :summary="summary"
          :puuid="player.puuid"
          :hide-privacy="app.settings.streamerMode"
        />
      </NScrollbar>
      <NEmpty
        v-if="!loading && !matches.length"
        :description="t(error ? 'libraryFailed' : 'noLocalMatches')"
      >
        <template v-if="error" #extra
          ><NButton @click="initialize">{{ t('retry') }}</NButton></template
        >
      </NEmpty>
      <div class="flex justify-end gap-2">
        <NButton :disabled="generating" @click="show = false">{{ t('cancel') }}</NButton>
        <NButton
          type="primary"
          :disabled="!player || !gameId || loading"
          :loading="generating"
          @click="generate"
          >{{ t('generate') }}</NButton
        >
      </div>
    </div>
  </NModal>
</template>
<script setup lang="ts">
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import type { PoolPlayer } from '@shared/pro/champion-pool'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { useTranslation } from 'i18next-vue'
import { NButton, NEmpty, NModal, NScrollbar, NSelect, useNotification } from 'naive-ui'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import { ExperienceRenderer } from '../../../shared/shards/experience'
import { useExperienceStore } from '../../../shared/shards/experience/store'
import { ProgressRenderer } from '../../../shared/shards/progress'
import { ReviewRenderer } from '../../../shared/shards/review'
const show = defineModel<boolean>('show', { required: true })
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const pool = useInstance(ChampionPoolRenderer),
  progress = useInstance(ProgressRenderer),
  experience = useInstance(ExperienceRenderer),
  reviews = useInstance(ReviewRenderer),
  resources = useGameResourceProvider(),
  app = useAppCommonStore(),
  workspace = useExperienceStore(),
  router = useRouter(),
  notification = useNotification()
const players = shallowRef<PoolPlayer[]>([]),
  matches = shallowRef<{ gameId: number; startedAt: number; championId: number }[]>([]),
  summary = shallowRef<LcuOrSgpGameSummary | null>(null)
const playerKey = ref<string | null>(null),
  gameId = ref<number | null>(null),
  page = ref(1),
  loading = ref(false),
  generating = ref(false),
  error = ref(false)
const key = (player: { serverId: string; puuid: string }) =>
  JSON.stringify([player.serverId, player.puuid])
const playerOptions = computed(() =>
  players.value.map((item) => ({ value: key(item), label: `${item.name} · ${item.serverId}` }))
)
const player = computed(() => players.value.find((item) => key(item) === playerKey.value))
const matchOptions = computed(() =>
  matches.value.map((item) => ({
    value: item.gameId,
    label: `${resources.champions.name(item.championId)} · ${new Date(item.startedAt).toLocaleString()} · #${item.gameId}`
  }))
)
let generation = 0,
  previewGeneration = 0
async function initialize() {
  const current = ++generation
  loading.value = true
  error.value = false
  try {
    const next = await pool.players()
    if (current !== generation || !show.value) return
    players.value = next
    const account = workspace.status?.account
    const nextKey =
      account && next.some((item) => key(item) === key(account))
        ? key(account)
        : next[0]
          ? key(next[0])
          : null
    const unchanged = playerKey.value === nextKey && page.value === 1
    page.value = 1
    playerKey.value = nextKey
    if (unchanged) await loadMatches()
  } catch {
    if (current === generation) {
      error.value = true
      loading.value = false
    }
  }
}
async function loadMatches() {
  const current = ++generation
  gameId.value = null
  matches.value = []
  summary.value = null
  if (!player.value || !show.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = false
  try {
    const next = await progress.candidates(player.value, page.value)
    if (current === generation) matches.value = next
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
async function generate() {
  if (!player.value || !gameId.value || generating.value) return
  const current = generation
  generating.value = true
  try {
    const report = await reviews.open({
      serverId: player.value.serverId,
      puuid: player.value.puuid,
      gameId: gameId.value,
      refresh: false
    })
    if (current !== generation || !show.value) return
    show.value = false
    await router.push({ name: REVIEW_ROUTE, query: { id: report.id } })
  } catch {
    notification.error({ title: t('loadFailed'), duration: 5000 })
  } finally {
    generating.value = false
  }
}
watch(playerKey, () => {
  page.value = 1
})
watch([playerKey, page], loadMatches)
watch(gameId, async (id) => {
  const current = ++previewGeneration
  summary.value = null
  if (!id || !player.value) return
  try {
    const games = await experience.games(player.value, [id])
    if (current === previewGeneration) summary.value = games[0] ?? null
  } catch {
    if (current === previewGeneration)
      notification.error({ title: t('libraryFailed'), duration: 4000 })
  }
})
watch(show, (visible) => {
  if (visible) {
    void initialize()
  } else {
    generation++
    previewGeneration++
  }
})
onScopeDispose(() => {
  generation++
  previewGeneration++
})
</script>
