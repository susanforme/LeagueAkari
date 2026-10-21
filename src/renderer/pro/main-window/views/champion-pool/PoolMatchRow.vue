<template>
  <div class="match-row" :class="participant?.winResult">
    <div class="outcome">
      <strong>{{ profileT(`dashboard.results.${participant?.winResult ?? 'unknown'}`) }}</strong
      ><small>{{ new Date(basic.gameCreation).toLocaleString() }}</small
      ><small
        >{{ resources.queues.name(basic.queueId) }} ·
        {{ formatGameTime(basic.gameDuration * 1000) }}</small
      >
    </div>
    <template v-if="participant">
      <ChampionIcon :champion-id="participant.championId" class="size-10! rounded" />
      <div class="stat">
        <b
          >{{ participant.kills }} / <em>{{ participant.deaths }}</em> /
          {{ participant.assists }}</b
        ><small>{{ metric(participant.kda, 2) }} KDA</small>
      </div>
      <div class="stat">
        <span>{{ metric(participant.cs) }} CS</span
        ><small
          >{{
            basic.gameDuration > 0 ? metric(participant.cs / (basic.gameDuration / 60), 1) : '—'
          }}
          / {{ t('minute') }}</small
        >
      </div>
      <div class="stat">
        <span>{{
          Number.isFinite(participant.totalDamageDealtToChampions)
            ? participant.totalDamageDealtToChampions.toLocaleString()
            : '—'
        }}</span
        ><small>{{ t('championDamage') }}</small>
      </div>
      <div class="items">
        <ItemDisplay
          v-for="(item, index) in participant.items"
          :key="index"
          :item-id="item"
          :size="25"
        />
      </div>
      <div class="spells">
        <SummonerSpellDisplay
          v-for="(spell, index) in participant.spells"
          :key="index"
          :spell-id="spell"
          :size="25"
        />
      </div>
    </template>
    <ManyTags v-if="hasTeams" class="match-tags" />
    <div class="actions"><slot /></div>
    <NButton
      quaternary
      size="small"
      :aria-expanded="expanded"
      :aria-label="t(expanded ? 'collapseMatch' : 'expandMatch')"
      @click="$emit('update:expanded', !expanded)"
      >{{ expanded ? '⌃' : '⌄' }}</NButton
    >
  </div>
</template>
<script setup lang="ts">
import ManyTags from '@renderer-shared/components/match-card/widgets/ManyTags.vue'
import { provideMatchCard } from '@renderer-shared/components/match-card/context'
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { formatGameTime } from '@shared/pro/review'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import SummonerSpellDisplay from '@renderer-shared/components/widgets/SummonerSpellDisplay.vue'
const props = defineProps<{ summary: LcuOrSgpGameSummary; puuid: string; expanded: boolean }>()
defineEmits<{ 'update:expanded': [expanded: boolean] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const { t: profileT } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
const resources = useGameResourceProvider()
provideMatchCard({
  summary: () => props.summary,
  puuid: () => props.puuid,
  isExpanded: () => props.expanded,
  details: null,
  hidePrivacy: true,
  loadingDetails: false,
  replayState: null,
  canDryRunOngoingGame: false,
  navigateToSummonerByPuuid: () => {},
  loadReplay: () => {},
  watchReplay: () => {},
  loadDetails: () => {},
  dryRunOngoingGame: () => {}
})
const hasTeams = computed(() =>
  props.summary.source === 'sgp'
    ? !!props.summary.data.json.teams?.length
    : !!props.summary.data.teams?.length
)
const metric = (value: number, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : '—')
const basic = computed(() => toBasicInfo(props.summary))
const participant = computed(() =>
  toParticipants(props.summary, basic.value).find((p) => p.puuid === props.puuid)
)
</script>
<style scoped>
.match-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 12px;
  min-width: 990px;
  border: 1px solid rgb(var(--la-card-border-rgb) / 0.12);
  border-left: 3px solid transparent;
  border-radius: 4px;
  background: var(--pool-surface);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.outcome {
  width: 190px;
  flex-shrink: 0;
}
.outcome strong {
  font-size: 13px;
}
.stat {
  min-width: 68px;
}
.stat b {
  white-space: nowrap;
}
.stat em {
  font-style: normal;
  color: #e45365;
}
.match-row small {
  display: block;
  font-size: 10px;
  opacity: 0.6;
  margin-top: 3px;
}
.items,
.spells {
  display: flex;
  gap: 3px;
}
.match-tags {
  flex: 1;
  min-width: 90px;
  max-width: 240px;
}
.actions {
  display: flex;
  gap: 7px;
  margin-left: auto;
  align-items: center;
}
.win {
  border-left-color: #22ac84;
}
.loss {
  border-left-color: #d9576b;
}
.win .outcome strong {
  color: #20a57c;
}
.loss .outcome strong {
  color: #d9576b;
}
</style>
