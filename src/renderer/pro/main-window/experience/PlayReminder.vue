<template>
  <NButton v-if="failedId" size="tiny" type="warning" @click="dismiss(failedId)">{{
    t('failed')
  }}</NButton>
</template>
<script setup lang="ts">
import { watch, onScopeDispose, ref } from 'vue'
import { NButton, useNotification, type NotificationReactive } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useExperienceStore } from '../../shared/shards/experience/store'
const api = useInstance(ExperienceRenderer),
  store = useExperienceStore(),
  league = useLeagueClientStore(),
  sgp = useSgpStore()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience.playReminder' })
const notification = useNotification(),
  failedId = ref<string | null>(null)
let shown: NotificationReactive | null = null,
  lastId = ''
watch(
  () =>
    [
      store.status?.reminder,
      league.isConnected,
      league.summoner.me?.puuid,
      league.gameflow.phase,
      sgp.availability.sgpServerId
    ] as const,
  ([reminder, connected, puuid, phase, serverId]) => {
    if (
      !connected ||
      puuid !== store.status?.account?.puuid ||
      serverId !== store.status?.account?.serverId ||
      !['EndOfGame', 'PreEndOfGame', 'Lobby', 'None'].includes(phase ?? '') ||
      !reminder
    ) {
      shown?.destroy()
      shown = null
      return
    }
    if (reminder.id === lastId) return
    shown?.destroy()
    lastId = reminder.id
    shown = notification.warning({
      title: t('title'),
      content: reminder.reasons
        .map((reason) => t(`reasons.${reason}`, { count: reminder[reason] }))
        .join(' · '),
      description: t('suggestion'),
      duration: 0,
      closable: true,
      onClose: () => {
        void dismiss(reminder.id)
        shown = null
      }
    })
  }
)
async function dismiss(id: string) {
  try {
    await api.dismissReminder(id)
    failedId.value = null
  } catch {
    failedId.value = id
  }
}
onScopeDispose(() => shown?.destroy())
</script>
