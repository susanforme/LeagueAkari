<template>
  <NPopover trigger="click" placement="bottom-end" :show="open" @update:show="open = $event">
    <template #trigger
      ><NButton
        size="tiny"
        quaternary
        :type="status?.progress.reached && active ? 'warning' : 'default'"
        ><template #icon><NIcon :component="Clock" /></template>{{ t('title') }}</NButton
      ></template
    >
    <div class="flex w-80 flex-col gap-3">
      <NAlert v-if="!player" type="info">{{ t('connect') }}</NAlert>
      <template v-else-if="status">
        <CurrentFocus />
        <template v-if="status.plan.session">
          <NTag :type="active ? 'success' : 'default'" size="small" class="self-start">{{
            t(active ? 'active' : 'ended')
          }}</NTag>
          <div class="grid grid-cols-2 gap-4 py-2">
            <div
              v-for="item in [
                {
                  icon: Flag,
                  label: tv('games'),
                  value: status.progress.games,
                  limit: status.plan.session.games
                },
                {
                  icon: Clock,
                  label: tv('minutes'),
                  value: status.progress.minutes,
                  limit: status.plan.session.minutes
                }
              ]"
              :key="item.label"
              class="flex flex-col items-center gap-2"
            >
              <NProgress
                type="circle"
                class="w-28!"
                :percentage="Math.min(100, (item.value / item.limit) * 100)"
                :stroke-width="7"
                :status="item.value >= item.limit ? 'success' : 'default'"
                :aria-label="`${item.label}: ${item.value} / ${item.limit}`"
              >
                <div class="flex flex-col items-center">
                  <NIcon :component="item.icon" :size="18" aria-hidden="true" /><span
                    class="text-2xl font-semibold tabular-nums"
                    >{{ item.value }}</span
                  ><span class="text-xs opacity-60">/ {{ item.limit }}</span>
                </div>
              </NProgress>
              <span class="text-xs opacity-70">{{ item.label }}</span>
            </div>
          </div>
          <div class="flex items-center justify-center gap-3">
            <NIcon :component="Trophy" :size="18" aria-hidden="true" /><span
              class="font-semibold tabular-nums"
              >{{
                t('record', { wins: status.progress.wins, losses: status.progress.losses })
              }}</span
            >
          </div>
          <span v-if="status.progress.missingDurations" class="text-xs">{{
            t('missing', { count: status.progress.missingDurations })
          }}</span>
          <div
            v-if="remaining"
            class="flex items-center gap-3 rounded-lg bg-(--la-card-muted-surface) p-3"
          >
            <NIcon :component="Coffee" :size="28" aria-hidden="true" /><span>{{
              t('resting', { minutes: remaining })
            }}</span>
          </div>
          <NAlert v-else-if="active && status.progress.reached" type="warning">{{
            t('reached')
          }}</NAlert>
        </template>
        <template v-if="!active">
          <span>{{ t('games') }}</span>
          <NInputNumber
            v-model:value="games"
            :min="1"
            :max="20"
            :precision="0"
            :input-props="{ 'aria-label': t('games') }"
          />
          <span>{{ t('minutes') }}</span>
          <NInputNumber
            v-model:value="minutes"
            :min="15"
            :max="720"
            :precision="0"
            :input-props="{ 'aria-label': t('minutes') }"
          />
          <NButton
            :disabled="!canChange || games === null || minutes === null || remaining > 0"
            :loading="saving"
            @click="change({ kind: 'start', games: games!, minutes: minutes! })"
            >{{ t('start') }}</NButton
          >
        </template>
        <div v-else class="flex gap-2">
          <NButton
            :disabled="!canChange"
            :loading="saving"
            @click="change({ kind: 'rest', minutes: 10 })"
            >{{ t('rest') }}</NButton
          >
          <NButton :disabled="!canChange" :loading="saving" @click="change({ kind: 'end' })">{{
            t('end')
          }}</NButton>
        </div>
        <NButton
          v-if="remaining"
          size="tiny"
          :disabled="!canChange"
          :loading="saving"
          @click="change({ kind: 'end' })"
          >{{ t('skipRest') }}</NButton
        >
        <span v-if="!canChange" class="text-xs opacity-60">{{ t('lobbyOnly') }}</span>
      </template>
      <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
    </div>
  </NPopover>
</template>
<script setup lang="ts">
import { computed, ref, watch, onScopeDispose } from 'vue'
import { NPopover, NButton, NAlert, NInputNumber, NIcon, NProgress, NTag } from 'naive-ui'
import { Flag, Clock, Trophy, Coffee } from '@vicons/tabler'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import type { PlanChange } from '@shared/pro/experience/plan'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useExperienceStore } from '../../shared/shards/experience/store'
import CurrentFocus from '../../shared/components/focus-goal/CurrentFocus.vue'
const store = useExperienceStore(),
  league = useLeagueClientStore(),
  sgp = useSgpStore(),
  api = useInstance(ExperienceRenderer)
const { t } = useTranslation(undefined, { keyPrefix: 'pro.playPlan' })
const { t: tv } = useTranslation(undefined, { keyPrefix: 'pro.visual' })
const player = computed(() =>
  league.isConnected &&
  league.summoner.me?.puuid === store.status?.account?.puuid &&
  sgp.availability.sgpServerId === store.status?.account?.serverId
    ? store.status?.account
    : null
)
const status = computed(() => (player.value ? store.status?.plan : null))
const active = computed(() => status.value?.plan.session?.endedAt === null)
const canChange = computed(() =>
  ['None', 'Lobby', 'EndOfGame', 'PreEndOfGame'].includes(league.gameflow.phase ?? '')
)
const games = ref<number | null>(3),
  minutes = ref<number | null>(90),
  saving = ref(false),
  error = ref(false),
  open = ref(false),
  now = ref(Date.now())
const remaining = computed(() =>
  Math.max(0, Math.ceil(((status.value?.plan.session?.breakUntil ?? 0) - now.value) / 60_000))
)
let timer: ReturnType<typeof setInterval> | undefined
watch(open, (value) => {
  clearInterval(timer)
  now.value = Date.now()
  if (value)
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
})
watch(player, () => {
  error.value = false
})
async function change(action: PlanChange['action']) {
  const account = player.value,
    current = status.value
  if (!account || !current || saving.value) return
  saving.value = true
  error.value = false
  try {
    await api.changePlan({ player: account, revision: current.plan.revision, action })
    const next = await api.status()
    if (player.value?.puuid === account.puuid && player.value.serverId === account.serverId)
      store.status = next
  } catch {
    error.value = true
  } finally {
    saving.value = false
  }
}
onScopeDispose(() => clearInterval(timer))
</script>
