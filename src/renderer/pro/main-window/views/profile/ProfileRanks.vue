<template>
  <div class="rank-grid">
    <section
      v-for="(queue, index) in rankedQueues"
      :key="queue"
      class="profile-panel rank-card"
      @click.stop="$emit('history', queue)"
    >
      <div class="rank-summary">
        <img
          class="rank-emblem"
          :src="emblem(entry(queue)?.tier)"
          :alt="rankLabel(entry(queue) ?? { tier: '', division: '' })"
        />
        <div class="rank-copy">
          <NButton text class="queue-title" @click.stop="$emit('history', queue)">
            {{ commonT(`queueTypes.${queue}`) }}
            <NIcon :component="ChevronRight20Regular" class="ml-1" />
          </NButton>
          <div class="rank-name">{{ rankLabel(entry(queue) ?? { tier: '', division: '' }) }}</div>
          <div class="rank-lp">
            {{ entry(queue)?.leaguePoints ?? '—' }} <span>LP</span>
            <NTag v-if="entry(queue)?.isProvisional" size="small">{{ t('provisional') }}</NTag>
          </div>
          <div class="rank-stats">
            <div>
              <strong class="wins">{{ entry(queue)?.wins ?? '—' }}</strong
              ><span>{{ t('dashboard.wins') }}</span>
            </div>
            <div>
              <strong class="losses">{{ entry(queue)?.losses ?? '—' }}</strong
              ><span>{{ t('dashboard.losses') }}</span>
            </div>
            <div>
              <strong>{{ winRate(entry(queue)) }}</strong
              ><span>{{ t('activity.winRate') }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="rank-history" @click.stop>
        <div class="profile-muted flex items-center justify-between gap-2 text-xs">
          <span>{{ t('dashboard.recentCaptures') }}</span>
          <NButton text size="tiny" @click.stop="$emit('history', queue)">{{
            t('dashboard.viewHistory')
          }}</NButton>
        </div>
        <NSpin :show="loading && !trends.length">
          <RankHistoryChart
            v-if="trends[index]?.points.length"
            compact
            :trend="trends[index]!"
            :selected="null"
            :rank-label="rankLabel"
            :color="index === 0 ? '#8d80db' : '#2ba580'"
            @select="$emit('history', queue)"
          />
          <div v-else class="rank-chart-empty profile-muted">
            {{ failed ? t('failed') : t('noSeasonRecords') }}
            <RefreshButton v-if="failed" text @click="load" />
          </div>
        </NSpin>
        <div class="rank-peaks">
          <div>
            <span>{{ t('dashboard.previousRank') }}</span
            ><strong
              ><img :src="emblem(entry(queue)?.previousSeasonEndTier)" alt="" />{{
                rankLabel({
                  tier: entry(queue)?.previousSeasonEndTier ?? '',
                  division: entry(queue)?.previousSeasonEndDivision ?? ''
                })
              }}</strong
            >
          </div>
          <div>
            <span>{{ t('dashboard.peakRank') }}</span
            ><strong
              ><img :src="emblem(entry(queue)?.highestTier)" alt="" />{{
                rankLabel({
                  tier: entry(queue)?.highestTier ?? '',
                  division: entry(queue)?.highestDivision ?? ''
                })
              }}</strong
            >
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import IronEmblem from '@renderer-shared/assets/ranked-icons-large/iron.png'
import BronzeEmblem from '@renderer-shared/assets/ranked-icons-large/bronze.png'
import SilverEmblem from '@renderer-shared/assets/ranked-icons-large/silver.png'
import GoldEmblem from '@renderer-shared/assets/ranked-icons-large/gold.png'
import PlatinumEmblem from '@renderer-shared/assets/ranked-icons-large/platinum.png'
import EmeraldEmblem from '@renderer-shared/assets/ranked-icons-large/emerald.png'
import DiamondEmblem from '@renderer-shared/assets/ranked-icons-large/diamond.png'
import MasterEmblem from '@renderer-shared/assets/ranked-icons-large/master.png'
import GrandmasterEmblem from '@renderer-shared/assets/ranked-icons-large/grandmaster.png'
import ChallengerEmblem from '@renderer-shared/assets/ranked-icons-large/challenger.png'
import UnrankedEmblem from '@renderer-shared/assets/ranked-icons-large/unranked.png'
import { ChevronRight20Regular } from '@vicons/fluent'
import { NButton, NIcon, NSpin, NTag } from 'naive-ui'
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
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import type { PlayerIdentity } from '@shared/pro/champion-pool'
import {
  rankedQueues,
  type ProfileSnapshot,
  type ProfileTrend,
  type RankPoint
} from '@shared/pro/profile'
import type { RankedEntry } from '@shared/types/league-client/ranked'
import { ProfileRenderer } from '../../../shared/shards/profile'
import RankHistoryChart from './RankHistoryChart.vue'

const props = defineProps<{
  player: PlayerIdentity
  snapshot?: ProfileSnapshot
  refreshToken: number
  rankLabel: (rank: Pick<RankPoint, 'tier' | 'division'>) => string
}>()
defineEmits<{ history: [queue: (typeof rankedQueues)[number]] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const { t: commonT } = useTranslation('common')
const api = useInstance(ProfileRenderer)
const emblems: Record<string, string> = {
  IRON: IronEmblem,
  BRONZE: BronzeEmblem,
  SILVER: SilverEmblem,
  GOLD: GoldEmblem,
  PLATINUM: PlatinumEmblem,
  EMERALD: EmeraldEmblem,
  DIAMOND: DiamondEmblem,
  MASTER: MasterEmblem,
  GRANDMASTER: GrandmasterEmblem,
  CHALLENGER: ChallengerEmblem,
  UNRANKED: UnrankedEmblem
}
const emblem = (tier?: string) => emblems[tier ?? 'UNRANKED'] ?? UnrankedEmblem
const entries = computed(() => props.snapshot?.ranked.queues ?? [])
const entry = (queue: string) => entries.value.find((rank) => rank.queueType === queue)
const winRate = (rank?: RankedEntry) =>
  rank && rank.wins + rank.losses
    ? `${((100 * rank.wins) / (rank.wins + rank.losses)).toFixed(1)}%`
    : '—'
const trends = shallowRef<ProfileTrend[]>([])
const loading = ref(false),
  failed = ref(false)
let active = false,
  generation = 0
useQueryCache(
  () => JSON.stringify([props.player.serverId, props.player.puuid]),
  trends,
  () => []
)
async function load() {
  if (!active) return
  const current = ++generation
  loading.value = true
  failed.value = false
  try {
    const result = await Promise.all(
      rankedQueues.map((queue) =>
        api.trend({ serverId: props.player.serverId, puuid: props.player.puuid, queue })
      )
    )
    if (current === generation)
      trends.value = result.map((trend) => ({ ...trend, points: trend.points.slice(-20) }))
  } catch {
    if (current === generation) failed.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch([() => props.player.serverId, () => props.player.puuid], () => {
  void load()
})
watch(() => props.refreshToken, load)
function activate() {
  if (!active) {
    active = true
    void load()
  }
}
function deactivate() {
  active = false
  generation++
}
onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onScopeDispose(deactivate)
useRefreshFeedback(
  () => failed.value,
  () => t('failed')
)
</script>
<style scoped>
.rank-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.rank-card {
  cursor: pointer;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: 20px;
}
.rank-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.rank-emblem {
  width: 112px;
  height: 124px;
  object-fit: contain;
  flex-shrink: 0;
}
.rank-copy {
  flex: 1;
  min-width: 0;
}
.queue-title {
  font-size: 13px;
}
.rank-name {
  font-weight: 700;
  font-size: 21px;
  margin-top: 12px;
  line-height: 1.3;
}
.rank-lp {
  font-weight: 650;
  font-size: 22px;
  margin-top: 2px;
}
.rank-lp > span {
  font-size: 14px;
}
.rank-stats {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-top: 18px;
}
.rank-stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rank-stats strong {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.rank-stats span,
.rank-peaks span {
  color: var(--profile-muted);
  font-size: 11px;
}
.wins {
  color: var(--profile-win);
}
.losses {
  color: var(--profile-loss);
}
.rank-history {
  min-width: 0;
}
.rank-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  font-size: 12px;
  gap: 8px;
}
.rank-peaks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.rank-peaks > div {
  background: rgb(var(--la-card-tint-rgb) / 0.035);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rank-peaks strong {
  display: flex;
  align-items: center;
  font-weight: 550;
  font-size: 12px;
  gap: 4px;
}
.rank-peaks img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
@container (min-width: 1200px) {
  .rank-card {
    cursor: pointer;
    grid-template-columns: 1.15fr 1fr;
    gap: 20px;
  }
}
@container (max-width: 740px) {
  .rank-grid {
    grid-template-columns: 1fr;
  }
  .rank-card {
    cursor: pointer;
    grid-template-columns: 1fr 1fr;
  }
}
@container (max-width: 560px) {
  .rank-card {
    cursor: pointer;
    grid-template-columns: 1fr;
  }
}
</style>
