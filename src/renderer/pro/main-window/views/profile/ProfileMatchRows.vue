<template>
  <NScrollbar x-scrollable>
    <div v-for="game in games" :key="game.gameId" class="mb-3">
      <div class="mb-1 flex justify-end">
        <NButton text size="tiny" @click="$emit('review', game.gameId)">{{
          t('dashboard.review')
        }}</NButton>
      </div>
      <MatchCard
        :summary="game"
        :puuid="puuid"
        :hide-privacy="app.settings.streamerMode"
        :details="details[game.gameId]"
        :loading-details="!!pending[game.gameId]"
        @load-details="loadDetails"
        @navigate-to-summoner-by-puuid="openPlayer"
      />
    </div>
  </NScrollbar>
</template>
<script setup lang="ts">
import { ref, shallowRef, watch, onScopeDispose } from 'vue'
import { NButton, NScrollbar, useNotification } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useRouter } from 'vue-router'
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import type { LcuOrSgpGameSummary, LcuOrSgpGameDetails } from '@shared/data-adapter/wrapper'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
const props = defineProps<{ games: LcuOrSgpGameSummary[]; puuid: string; serverId: string }>()
defineEmits<{ review: [id: number] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const api = useInstance(ChampionPoolRenderer),
  app = useAppCommonStore(),
  router = useRouter(),
  notification = useNotification()
const details = shallowRef<Record<number, LcuOrSgpGameDetails>>({}),
  pending = ref<Record<number, boolean>>({})
let generation = 0
watch([() => props.puuid, () => props.serverId], () => {
  generation++
  details.value = {}
  pending.value = {}
})
onScopeDispose(() => {
  generation++
})
async function loadDetails(gameId: number) {
  if (pending.value[gameId] || details.value[gameId]) return
  const current = generation
  pending.value[gameId] = true
  try {
    const value = await api.details({ serverId: props.serverId, puuid: props.puuid }, gameId)
    if (current === generation && value) details.value = { ...details.value, [gameId]: value }
  } catch {
    if (current === generation) notification.warning({ title: t('failed'), duration: 4000 })
  } finally {
    if (current === generation) pending.value[gameId] = false
  }
}
function openPlayer(puuid: string) {
  void router.push({ name: 'player-tabs', params: { sgpServerId: props.serverId, puuid } })
}
</script>
