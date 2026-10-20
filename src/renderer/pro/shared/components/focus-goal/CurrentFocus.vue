<template>
  <NCard
    v-if="focus && player && (!championId || focus.championId === championId)"
    size="small"
    :title="t('title')"
  >
    <div class="flex flex-col gap-2">
      <span class="break-words whitespace-pre-wrap">{{ focus.text }}</span>
      <div class="flex flex-wrap gap-3">
        <NButton text size="tiny" @click="locate">{{ t('evidence') }}</NButton>
        <NButton size="tiny" :loading="saving" @click="finish">{{ t('complete') }}</NButton>
      </div>
      <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
    </div>
  </NCard>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NButton, NAlert } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { ExperienceRenderer } from '../../shards/experience'
import { useExperienceStore } from '../../shards/experience/store'
defineProps<{ championId?: number }>()
const store = useExperienceStore(),
  league = useLeagueClientStore(),
  sgp = useSgpStore()
const api = useInstance(ExperienceRenderer),
  router = useRouter()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.focusGoal' })
const player = computed(() =>
  league.isConnected &&
  league.summoner.me?.puuid === store.status?.account?.puuid &&
  sgp.availability.sgpServerId === store.status?.account?.serverId
    ? store.status?.account
    : null
)
const focus = computed(() => (player.value ? store.status?.plan?.plan.focus : null))
const saving = ref(false),
  error = ref(false)
function locate() {
  if (focus.value)
    void router.push({
      name: REVIEW_ROUTE,
      query: { id: focus.value.reportId, time: focus.value.timestamp }
    })
}
async function finish() {
  const account = player.value,
    status = store.status?.plan
  if (!account || !status || saving.value) return
  saving.value = true
  error.value = false
  try {
    const next = await api.changePlan({
      player: account,
      revision: status.plan.revision,
      action: { kind: 'clearFocus' }
    })
    if (
      store.status?.account?.puuid === account.puuid &&
      store.status.account.serverId === account.serverId
    )
      store.status = { ...store.status, plan: { ...status, plan: next } }
  } catch {
    error.value = true
  } finally {
    saving.value = false
  }
}
</script>
