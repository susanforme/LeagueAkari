<template>
  <div class="match-table-scroll">
    <table class="profile-match-table">
      <thead>
        <tr>
          <th>{{ t('dashboard.result') }}</th>
          <th>{{ t('dashboard.champion') }}</th>
          <th>KDA</th>
          <th>{{ t('dashboard.gold') }}</th>
          <th>CS</th>
          <th>{{ t('activity.duration') }}</th>
          <th>{{ t('dashboard.queue') }}</th>
          <th>
            <span class="sr-only">{{ t('dashboard.review') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.summary.gameId"
          :class="row.participant?.winResult"
          @click.stop="$emit('review', row.summary.gameId)"
        >
          <td>
            <strong class="match-result">{{
              t(`dashboard.results.${row.participant?.winResult ?? 'unknown'}`)
            }}</strong
            ><time
              class="profile-muted"
              :datetime="new Date(row.basic.gameCreation).toISOString()"
              >{{
                new Date(row.basic.gameCreation).toLocaleDateString(resources.runtime.locale, {
                  month: 'short',
                  day: 'numeric'
                })
              }}</time
            >
          </td>
          <td>
            <NButton text @click.stop="$emit('review', row.summary.gameId)"
              ><div class="match-champion">
                <ChampionIcon
                  :champion-id="row.participant?.championId"
                  class="size-9! rounded"
                /><span>{{
                  row.participant ? resources.champions.name(row.participant.championId) : '—'
                }}</span>
              </div></NButton
            >
          </td>
          <td>
            <div v-if="row.participant" class="whitespace-nowrap">
              {{ row.participant.kills }} /
              <span class="deaths">{{ row.participant.deaths }}</span> /
              {{ row.participant.assists }}
            </div>
            <span v-else>—</span
            ><span class="profile-muted">{{ metric(row.participant?.kda, 1) }} KDA</span>
          </td>
          <td>{{ metric(row.participant ? row.participant.goldEarned / 1000 : undefined, 1) }}k</td>
          <td>{{ metric(row.participant?.cs) }}</td>
          <td>{{ formatGameTime(row.basic.gameDuration * 1000) }}</td>
          <td class="profile-muted queue-cell">{{ resources.queues.name(row.basic.queueId) }}</td>
          <td>
            <NButton
              quaternary
              circle
              size="small"
              :aria-label="t('dashboard.reviewMatch', { id: row.summary.gameId })"
              @click.stop="$emit('review', row.summary.gameId)"
              ><template #icon><NIcon :component="ChevronRight20Regular" /></template
            ></NButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { ChevronRight20Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { formatGameTime } from '@shared/pro/review'
const props = defineProps<{ games: LcuOrSgpGameSummary[]; puuid: string }>()
defineEmits<{ review: [id: number] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const resources = useGameResourceProvider()
const rows = computed(() =>
  props.games.map((summary) => {
    const basic = toBasicInfo(summary)
    return {
      summary,
      basic,
      participant: toParticipants(summary, basic).find(
        (participant) => participant.puuid === props.puuid
      )
    }
  })
)
const metric = (value?: number, digits = 0) =>
  value !== undefined && Number.isFinite(value) ? value.toFixed(digits) : '—'
</script>
<style scoped>
.match-table-scroll {
  overflow-x: auto;
}
.profile-match-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
th {
  font-size: 11px;
  font-weight: 400;
  color: var(--profile-muted);
  padding: 4px 10px 10px;
  white-space: nowrap;
}
td {
  padding: 8px 10px;
  border-top: 1px solid var(--profile-border);
  white-space: nowrap;
}
th:first-child,
td:first-child {
  padding-left: 20px;
}
th:last-child,
td:last-child {
  padding-right: 14px;
}
td time,
td > .profile-muted {
  display: block;
  font-size: 11px;
  margin-top: 3px;
}
.match-result {
  font-size: 13px;
}
.win .match-result {
  color: var(--profile-win);
}
.loss .match-result,
.deaths {
  color: var(--profile-loss);
}
.match-champion {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
}
tbody tr {
  cursor: pointer;
}
tr:hover {
  background: rgb(var(--la-card-tint-rgb) / 0.025);
}
.queue-cell {
  max-width: 110px;
  white-space: normal;
}
</style>
