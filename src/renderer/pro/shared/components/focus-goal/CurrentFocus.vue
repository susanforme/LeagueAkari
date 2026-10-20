<template>
  <NCard v-if="focus && player && (!championId || focus.championId === championId)" size="small">
    <template #header
      ><span class="flex items-center gap-2"
        ><NIcon :component="Target" :size="20" />{{ t('title') }}</span
      ></template
    >
    <div class="flex flex-col gap-2">
      <div class="flex items-start gap-3">
        <ChampionIcon :champion-id="focus.championId" class="size-11! shrink-0 rounded-lg" /><span
          class="min-w-0 text-sm break-words whitespace-pre-wrap"
          >{{ focus.text }}</span
        >
      </div>
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
import { NCard, NButton, NAlert, NIcon } from 'naive-ui'
import { Target } from '@vicons/tabler'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
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
