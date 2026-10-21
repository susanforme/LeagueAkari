<template>
  <NCard v-if="data?.session" size="small">
    <template #header>{{ t('session') }}</template>
    <template #header-extra><ShareCard :title="t('session')" :lines="sessionLines" /></template>
    <div class="flex flex-col gap-2">
      <span>{{ sessionLines[0] }}</span>
      <span class="text-xs opacity-60"
        >{{ new Date(data.session.from).toLocaleString() }} —
        {{ new Date(data.session.to).toLocaleTimeString() }}</span
      >
      <span>{{ sessionLines[1] }}</span>
      <span>{{ sessionLines[2] }}</span>
      <span v-for="rank in data.ranks" :key="rank.queue" class="text-xs"
        >{{ commonT(`queueTypes.${rank.queue}`, { defaultValue: rank.queue }) }} ·
        {{ t('observedRank') }} {{ rankLabel(rank.before) }} → {{ rankLabel(rank.after) }}</span
      >
    </div>
  </NCard>
  <NCollapse :default-expanded-names="['partners']">
    <NCollapseItem :title="t('partners')" name="partners">
      <NAlert v-if="data?.truncated" type="info">{{
        t('sampleLimit', { count: data.scanned })
      }}</NAlert>
      <NEmpty v-if="data && !data.partners.length" :description="t('noPartners')" />
      <div class="partner-grid">
        <section v-for="partner in data?.partners" :key="partner.puuid" class="partner-card">
          <div class="flex items-center justify-between gap-3">
            <NButton text class="font-bold" @click="openPartner(partner)">{{
              privacy ? t('player') : partner.name || t('player')
            }}</NButton>
            <NButton size="tiny" quaternary @click="openGames(partner)">{{
              t('viewShared')
            }}</NButton>
          </div>
          <div class="partner-score">
            <strong>{{
              partner.wins + partner.losses
                ? Math.round((partner.wins / (partner.wins + partner.losses)) * 100) + '%'
                : '—'
            }}</strong>
            <div>
              <span>{{ t('sharedGames', { count: partner.games }) }}</span>
              <div class="text-xs opacity-60">
                {{ profileT('activity.results', { wins: partner.wins, losses: partner.losses }) }}
              </div>
            </div>
          </div>
          <NProgress
            type="line"
            :percentage="
              partner.wins + partner.losses
                ? (partner.wins / (partner.wins + partner.losses)) * 100
                : 0
            "
            :show-indicator="false"
            :height="5"
          />
          <div
            v-for="combo in partner.combinations.slice(0, 3)"
            :key="`${combo.own}:${combo.partner}`"
            class="partner-combo"
          >
            <ChampionIcon :champion-id="combo.own" class="size-7! rounded" /><span>+</span
            ><ChampionIcon :champion-id="combo.partner" class="size-7! rounded" />
            <span class="flex-1"
              >{{ resources.champions.name(combo.own) }} +
              {{ resources.champions.name(combo.partner) }}</span
            >
            <span class="opacity-60">{{ combo.games }}</span>
          </div>
        </section>
      </div>
    </NCollapseItem>
  </NCollapse>
  <NModal v-model:show="show" preset="card" :title="t('viewShared')" class="w-[960px]!">
    <NScrollbar style="max-height: 65vh" x-scrollable>
      <div v-for="game in games" :key="game.gameId" class="mb-3">
        <div class="mb-1 flex justify-end">
          <MatchShare :summary="game" :puuid="player.puuid" />
        </div>
        <MatchCard :summary="game" :puuid="player.puuid" :hide-privacy="privacy" />
      </div>
    </NScrollbar>
    <NPagination
      v-model:page="page"
      :page-size="20"
      :item-count="selected?.gameIds.length ?? 0"
      :disabled="gamesLoading"
      class="mt-3"
    />
  </NModal>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import {
  computed,
  onMounted,
  onActivated,
  onDeactivated,
  onScopeDispose,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useRouter } from 'vue-router'
import {
  NProgress,
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NModal,
  NScrollbar,
  NPagination
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import MatchCard from '@renderer-shared/components/match-card/MatchCard.vue'
import type { PlayerIdentity } from '@shared/pro/champion-pool'
import type { SocialSummary, Partner } from '@shared/pro/experience'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { ExperienceRenderer } from '../../../shared/shards/experience'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import ShareCard from '../../../shared/components/share-card/ShareCard.vue'
import MatchShare from '../../../shared/components/share-card/MatchShare.vue'
const props = defineProps<{ player: PlayerIdentity; refreshToken: number }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' }),
  { t: commonT } = useTranslation('common')
const { t: profileT } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const api = useInstance(ExperienceRenderer),
  pool = useInstance(ChampionPoolRenderer),
  router = useRouter()
const resources = useGameResourceProvider(),
  app = useAppCommonStore()
const privacy = computed(() => app.settings.streamerMode)
const data = shallowRef<SocialSummary | null>(null),
  error = ref(false),
  show = ref(false)
const games = shallowRef<LcuOrSgpGameSummary[]>([]),
  selected = shallowRef<Partner | null>(null)
const page = ref(1),
  gamesError = ref(false),
  gamesLoading = ref(false)
let active = true,
  epoch = 0,
  gameEpoch = 0
function rankLabel(value: string) {
  const tier = value.split(' ')[0]
  return value.replace(tier, commonT(`tiers.${tier}`, { defaultValue: tier }))
}
const sessionLines = computed(() => {
  const session = data.value?.session
  return session
    ? [
        t('sessionScore', { count: session.games, wins: session.wins, losses: session.losses }),
        `${Math.round(session.durationSeconds / 60)} ${t('minutes')} · ${t('remakes', { count: session.remakes })}`,
        session.champions
          .slice(0, 5)
          .map((c) => `${resources.champions.name(c.championId)} × ${c.games}`)
          .join(' · '),
        ...data.value!.ranks.map(
          (r) =>
            `${commonT(`queueTypes.${r.queue}`, { defaultValue: r.queue })}: ${rankLabel(r.before)} → ${rankLabel(r.after)}`
        ),
        `${new Date(session.from).toLocaleString()} — ${new Date(session.to).toLocaleTimeString()}`
      ]
    : []
})
useQueryCache(
  () => JSON.stringify([props.player.serverId, props.player.puuid]),
  data,
  () => null
)
useQueryCache(
  () =>
    JSON.stringify([props.player.serverId, props.player.puuid, selected.value?.puuid, page.value]),
  games,
  () => []
)
async function load() {
  if (!active) return
  const current = ++epoch
  try {
    const next = await api.social(props.player)
    if (current === epoch) {
      data.value = next
      error.value = false
    }
  } catch {
    if (current === epoch) error.value = true
  }
}
function openPartner(partner: Partner) {
  void router.push({
    name: 'player-tabs',
    params: { puuid: partner.puuid, sgpServerId: props.player.serverId }
  })
}
function openGames(partner: Partner) {
  selected.value = partner
  page.value = 1
  show.value = true
  void loadGames()
}
async function loadGames() {
  if (!selected.value || !active) return
  const current = ++gameEpoch
  gamesLoading.value = true
  try {
    const next = await api.games(
      props.player,
      selected.value.gameIds.slice((page.value - 1) * 20, page.value * 20)
    )
    if (current === gameEpoch) {
      games.value = next
      gamesError.value = false
    }
  } catch {
    if (current === gameEpoch) gamesError.value = true
  } finally {
    if (current === gameEpoch) gamesLoading.value = false
  }
}
watch(page, loadGames)
watch([() => props.player.serverId, () => props.player.puuid], () => {
  show.value = false
  gameEpoch++
  void load()
})
watch(() => props.refreshToken, load)
pool.onChanged(load)
onActivated(() => {
  active = true
  void load()
})
onMounted(load)
onDeactivated(() => {
  active = false
  epoch++
  gameEpoch++
  show.value = false
})
onScopeDispose(() => {
  active = false
  epoch++
  gameEpoch++
})
useRefreshFeedback(
  () => error.value || gamesError.value,
  () => t('failed')
)
</script>

<style scoped>
.partner-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}
.partner-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--profile-border);
  border-radius: 10px;
  background: var(--la-card-muted-surface);
}
.partner-score {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 18px 0 10px;
}
.partner-score strong {
  font-size: 30px;
  color: var(--profile-win);
  font-variant-numeric: tabular-nums;
}
.partner-combo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-top: 12px;
}
</style>
