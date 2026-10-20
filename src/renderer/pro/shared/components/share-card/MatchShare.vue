<template><ShareCard :title="t('matchCard')" :lines="lines" /></template>
<script setup lang="ts">
import { computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import ShareCard from './ShareCard.vue'
const props = defineProps<{ summary: LcuOrSgpGameSummary; puuid: string }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const resources = useGameResourceProvider()
const lines = computed(() => {
  const summary = props.summary,
    basic = toBasicInfo(summary)
  const id =
    summary.source === 'lcu'
      ? summary.data.participantIdentities.find((p) => p.player.puuid === props.puuid)
          ?.participantId
      : null
  const player =
    summary.source === 'sgp'
      ? summary.data.json.participants.find((p) => p.puuid === props.puuid)
      : summary.data.participants.find((p) => p.participantId === id)
  const stats = player && ('stats' in player ? player.stats : player)
  return [
    `${resources.champions.name(player?.championId ?? -1)} · ${resources.queues.name(basic.queueId)}`,
    `${stats ? t(stats.win ? 'win' : 'loss') : '—'} · ${Math.round(basic.gameDuration / 60)} ${t('minutes')}`,
    `K / D / A   ${stats?.kills ?? '—'} / ${stats?.deaths ?? '—'} / ${stats?.assists ?? '—'}`,
    new Date(basic.gameCreation).toLocaleString()
  ]
})
</script>
