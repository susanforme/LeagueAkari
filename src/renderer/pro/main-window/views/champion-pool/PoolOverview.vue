<template>
  <div class="overview">
    <div class="overview-top">
      <section class="panel summary">
        <div class="tabs">
          <NButton
            v-for="tab in ['overview', 'trends'] as const"
            :key="tab"
            size="small"
            :type="view === tab ? 'primary' : 'default'"
            quaternary
            @click="view = tab"
            >{{ t(tab) }}</NButton
          ><span class="coverage">{{ t('sampleScope', { count: result.filteredMatches }) }}</span>
        </div>
        <div class="summary-grid">
          <div>
            <span>{{ t('games') }}</span
            ><strong>{{ result.overview.games }}</strong
            ><small>{{ range }}</small>
          </div>
          <div>
            <span>{{ t('championsPlayed') }}</span
            ><strong>{{ result.champions.filter((c) => c.championId).length }}</strong
            ><small>{{ t('selectedFilters') }}</small>
          </div>
          <div>
            <span>{{ t('winRate') }}</span
            ><strong class="accent"><MetricValue :metric="result.overview.winRate" ratio /></strong
            ><small>{{ t('metricSamples', { count: result.overview.winRate.samples }) }}</small>
          </div>
          <NButton
            v-if="favorite"
            class="favorite"
            quaternary
            :disabled="!favorite.championId"
            @click="select(favorite.championId)"
            ><ChampionIcon :champion-id="favorite.championId ?? -1" class="size-16! rounded" />
            <div>
              <span>{{ t('mostPlayed') }}</span
              ><strong>{{ name(favorite.championId) }}</strong
              ><small
                >{{ favorite.games }} {{ t('games') }} ·
                {{ percent(favorite.winRate.value) }}</small
              >
            </div></NButton
          >
        </div>
      </section>
      <section class="panel positions">
        <h3>{{ t('positionDistribution') }}</h3>
        <div class="position-content">
          <div
            class="donut"
            :style="{ background: distributionGradient }"
            role="img"
            :aria-label="t('positionDistribution')"
          >
            <span>{{ result.filteredMatches }}</span>
          </div>
          <div class="legend">
            <NButton
              v-for="(row, index) in result.positionDistribution"
              :key="row.position"
              text
              size="tiny"
              @click="$emit('position', row.position)"
              ><i :style="{ background: colors[index % colors.length] }" /><span>{{
                positionName(row.position)
              }}</span
              ><b
                >{{ row.games }}
                <small>({{ percent(row.games / result.filteredMatches) }})</small></b
              ></NButton
            ><small v-if="!result.filteredMatches">{{ t('empty') }}</small>
          </div>
        </div>
      </section>
    </div>
    <div v-if="view === 'overview'" class="chart-grid">
      <section class="panel">
        <div class="panel-heading">
          <h3>{{ t('usage') }}</h3>
          <NRadioGroup v-model:value="ranking" size="small"
            ><NRadioButton v-for="key in rankingKeys" :key="key" :value="key">{{
              t(key)
            }}</NRadioButton></NRadioGroup
          >
        </div>
        <div class="ranking">
          <NButton
            v-for="row in ranked"
            :key="row.championId ?? 0"
            text
            :disabled="!row.championId"
            @click="select(row.championId)"
            ><ChampionIcon :champion-id="row.championId ?? -1" class="size-8! rounded" /><span
              class="champion-name"
              >{{ name(row.championId) }}</span
            ><span class="bar-track"><i :style="{ width: `${barWidth(row)}%` }" /></span
            ><span class="bar-value">{{
              ranking === 'games'
                ? row.games
                : ranking === 'winRate'
                  ? percent(row.winRate.value)
                  : (row.kda.value?.toFixed(2) ?? '—')
            }}</span></NButton
          >
        </div>
        <NEmpty v-if="!ranked.length" :description="t('empty')" />
      </section>
      <section class="panel">
        <h3>{{ t('winRateVsGames') }}</h3>
        <div class="scatter">
          <span class="axis-y">{{ t('winRate') }}</span>
          <div class="plot">
            <div
              v-for="tick in [0, 25, 50, 75, 100]"
              :key="tick"
              class="gridline"
              :style="{ bottom: `${tick}%` }"
            >
              <span>{{ tick }}%</span>
            </div>
            <NTooltip
              v-for="row in result.champions.filter(
                (c) => c.championId && c.winRate.value !== null
              )"
              :key="row.championId!"
              ><template #trigger
                ><NButton
                  class="point"
                  text
                  :style="{
                    left: `${(row.games / maxGames) * 100}%`,
                    bottom: `${row.winRate.value! * 100}%`
                  }"
                  :aria-label="name(row.championId)"
                  @click="select(row.championId)"
                  ><ChampionIcon
                    :champion-id="row.championId!"
                    class="size-8! rounded-full" /></NButton></template
              >{{ name(row.championId) }} · {{ row.games }} {{ t('games') }} ·
              {{ percent(row.winRate.value) }}</NTooltip
            >
          </div>
          <div class="axis-x">
            <span>0</span><span>{{ t('games') }}</span
            ><span>{{ maxGames }}</span>
          </div>
        </div>
      </section>
      <section class="panel radar">
        <h3>{{ t('performanceRadar') }}</h3>
        <svg viewBox="0 0 340 240" role="img" :aria-label="t('performanceRadar')">
          <polygon
            v-for="level in [0.25, 0.5, 0.75, 1]"
            :key="level"
            :points="polygon(radarKeys.map(() => level))"
            class="radar-grid"
          />
          <line
            v-for="(_, index) in radarKeys"
            :key="index"
            x1="170"
            y1="116"
            :x2="point(index, 1)[0]"
            :y2="point(index, 1)[1]"
            class="radar-grid"
          />
          <polygon
            v-if="radarKeys.every((key) => result.overview[key].value !== null)"
            :points="
              polygon(
                radarKeys.map((key) => Math.min(1, (result.overview[key].value ?? 0) / limits[key]))
              )
            "
            class="radar-value"
          />
          <text
            v-for="(key, index) in radarKeys"
            :key="key"
            :x="point(index, 1.28)[0]"
            :y="point(index, 1.28)[1]"
            text-anchor="middle"
          >
            <tspan :x="point(index, 1.28)[0]">{{ t(key) }}</tspan>
            <tspan :x="point(index, 1.28)[0]" dy="15">
              {{
                ['damageShare', 'killParticipation'].includes(key)
                  ? percent(result.overview[key].value)
                  : (result.overview[key].value?.toFixed(2) ?? '—')
              }}
            </tspan>
          </text></svg
        ><NTooltip
          ><template #trigger
            ><small tabindex="0">{{ t('radarScope') }}</small></template
          >{{ t('radarScale') }}</NTooltip
        >
      </section>
    </div>
    <section v-else class="panel trends">
      <div class="panel-heading">
        <h3>{{ t('dailyPerformance') }}</h3>
        <small>{{ t('selectDay') }}</small>
      </div>
      <NScrollbar x-scrollable
        ><div class="daily-bars">
          <NTooltip v-for="day in result.daily" :key="day.day"
            ><template #trigger
              ><NButton
                class="day"
                quaternary
                :aria-label="new Date(day.day).toLocaleDateString()"
                @click="$emit('day', day.day)"
                ><span
                  class="day-stack"
                  :style="{ height: `${Math.max(3, (day.games / maxDaily) * 135)}px` }"
                  ><i :style="{ height: `${(day.wins / day.games) * 100}%` }" /></span
                ><small>{{
                  new Date(day.day).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric'
                  })
                }}</small></NButton
              ></template
            >{{ day.games }} {{ t('games') }} · {{ t('winRate') }}
            {{ percent(day.decided ? day.wins / day.decided : null) }}</NTooltip
          >
        </div></NScrollbar
      ><NEmpty v-if="!result.daily.length" :description="t('empty')" />
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NButton,
  NEmpty,
  NRadioGroup,
  NRadioButton,
  NTooltip,
  NScrollbar,
  useThemeVars
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { PoolResult, ChampionStats, PoolMatch } from '@shared/pro/champion-pool'
import MetricValue from './MetricValue.vue'
const props = defineProps<{ result: PoolResult }>()
const emit = defineEmits<{
  select: [id: number]
  position: [position: PoolMatch['position']]
  day: [day: number]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const { t: common } = useTranslation('common')
const resources = useGameResourceProvider(),
  theme = useThemeVars()
const name = (id: number | null) => (id ? resources.champions.name(id) : t('unknownChampion'))
const positionName = (p: string) =>
  p === 'UNKNOWN' ? t('unknownPosition') : common(`positions.${p}`)
const select = (id: number | null) => {
  if (id) emit('select', id)
}
const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`)
const view = ref<'overview' | 'trends'>('overview'),
  ranking = ref<'games' | 'winRate' | 'kda'>('games')
const rankingKeys = ['games', 'winRate', 'kda'] as const
const value = (row: ChampionStats) =>
  ranking.value === 'games' ? row.games : (row[ranking.value].value ?? -1)
const ranked = computed(() =>
  props.result.champions.toSorted((a, b) => value(b) - value(a) || b.games - a.games).slice(0, 6)
)
const favorite = computed(() => props.result.champions.toSorted((a, b) => b.games - a.games)[0])
const barWidth = (row: ChampionStats) =>
  (Math.max(0, value(row)) / Math.max(1, ...ranked.value.map(value))) * 100
const maxGames = computed(() =>
  Math.max(10, Math.ceil(Math.max(0, ...props.result.champions.map((c) => c.games)) / 10) * 10)
)
const maxDaily = computed(() => Math.max(1, ...props.result.daily.map((d) => d.games)))
const range = computed(() =>
  props.result.from === null
    ? t('empty')
    : `${new Date(props.result.from).toLocaleDateString()} – ${new Date(props.result.to!).toLocaleDateString()}`
)
const colors = computed(() => [
  theme.value.primaryColor,
  '#62aaa2',
  '#89a7b5',
  '#a79abd',
  '#879593',
  '#777f88'
])
const distributionGradient = computed(() => {
  let offset = 0
  return `conic-gradient(${
    props.result.positionDistribution
      .map((row, index) => {
        const start = offset
        offset += (row.games / props.result.filteredMatches) * 100
        return `${colors.value[index % colors.value.length]} ${start}% ${offset}%`
      })
      .join(',') || 'transparent 0% 100%'
  })`
})
const radarKeys = ['kda', 'csPerMin', 'damageShare', 'visionPerMin', 'killParticipation'] as const
const limits = { kda: 6, csPerMin: 10, damageShare: 0.5, visionPerMin: 2, killParticipation: 1 }
const point = (index: number, value: number) => [
  170 + Math.sin((index * Math.PI * 2) / 5) * 75 * value,
  116 - Math.cos((index * Math.PI * 2) / 5) * 75 * value
]
const polygon = (values: number[]) =>
  values.map((value, index) => point(index, value).join(',')).join(' ')
</script>
<style scoped>
.overview {
  --accent: v-bind('theme.primaryColor');
  display: grid;
  gap: 14px;
}
.panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--pool-border);
  border-radius: 7px;
  background: var(--pool-surface);
}
h3 {
  font-size: 13px;
  font-weight: 650;
  margin: 0 0 14px;
}
.overview-top {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(270px, 1fr);
  gap: 14px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
}
.coverage {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.55;
}
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1.5fr;
  gap: 16px;
}
.summary-grid > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid rgb(var(--la-card-border-rgb) / 0.12);
}
.summary-grid span,
.favorite span {
  font-size: 12px;
  opacity: 0.7;
}
.summary-grid strong {
  font-size: 28px;
  font-weight: 650;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.summary-grid small {
  font-size: 11px;
  opacity: 0.55;
}
.accent {
  color: var(--accent);
}
.favorite {
  height: auto;
  white-space: normal;
  text-align: left;
  padding: 10px;
}
.favorite :deep(.n-button__content) {
  gap: 12px;
}
.favorite div {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.favorite strong {
  font-size: 19px;
}
.position-content {
  display: flex;
  gap: 18px;
  align-items: center;
}
.donut {
  width: 106px;
  height: 106px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.donut span {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--la-card-surface-95);
  font-size: 19px;
}
.legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.legend :deep(.n-button__content) {
  width: 100%;
  gap: 7px;
  font-size: 11px;
}
.legend i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.legend b {
  margin-left: auto;
  font-weight: 400;
}
.legend small {
  opacity: 0.6;
}
.chart-grid {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  gap: 14px;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}
.panel-heading h3 {
  margin: 0;
}
.ranking {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ranking :deep(.n-button__content) {
  width: 100%;
  display: flex;
  gap: 9px;
}
.champion-name {
  width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  font-size: 12px;
}
.bar-track {
  height: 12px;
  background: var(--la-card-muted-surface);
  flex: 1;
  border-radius: 2px;
  overflow: hidden;
}
.bar-track i {
  display: block;
  height: 100%;
  background: var(--accent);
  opacity: 0.85;
}
.bar-value {
  width: 44px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.scatter {
  padding: 6px 20px 8px 35px;
}
.axis-y {
  font-size: 10px;
  opacity: 0.6;
}
.plot {
  height: 180px;
  position: relative;
  margin-top: 18px;
}
.gridline {
  position: absolute;
  width: 100%;
  border-top: 1px solid rgb(var(--la-card-border-rgb) / 0.13);
}
.gridline > span {
  position: absolute;
  right: calc(100% + 8px);
  transform: translateY(-50%);
  font-size: 10px;
  opacity: 0.55;
}
.point {
  position: absolute;
  transform: translate(-50%, 50%);
  z-index: 1;
}
.point:hover {
  z-index: 2;
}
.axis-x {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 10px;
  opacity: 0.6;
}
.radar svg {
  display: block;
  width: 100%;
  max-height: 220px;
  overflow: visible;
}
.radar-grid {
  fill: none;
  stroke: currentColor;
  opacity: 0.13;
  stroke-width: 1;
}
.radar-value {
  fill: var(--accent);
  fill-opacity: 0.2;
  stroke: var(--accent);
  stroke-width: 1.5;
}
.radar text {
  fill: currentColor;
  font-size: 10px;
}
.radar > small {
  display: block;
  text-align: center;
  opacity: 0.6;
  font-size: 11px;
}
.daily-bars {
  display: flex;
  align-items: end;
  gap: 8px;
  min-height: 180px;
}
.day {
  height: auto;
  padding: 8px 4px;
  min-width: 50px;
}
.day :deep(.n-button__content) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: end;
}
.day-stack {
  display: flex;
  align-items: end;
  width: 24px;
  background: var(--la-card-muted-surface);
  border-radius: 3px;
  overflow: hidden;
}
.day-stack i {
  display: block;
  width: 100%;
  background: var(--accent);
}
.day small {
  font-size: 10px;
  opacity: 0.7;
}
@media (max-width: 1250px) {
  .overview-top {
    grid-template-columns: 1fr;
  }
  .position-content {
    gap: 30px;
  }
  .legend {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 24px;
  }
  .chart-grid {
    grid-template-columns: 1.2fr 1fr;
  }
  .radar {
    grid-column: 1/-1;
  }
  .radar svg {
    max-height: 230px;
  }
}
@media (max-width: 850px) {
  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }
  .chart-grid {
    grid-template-columns: 1fr;
  }
  .coverage {
    display: none;
  }
  .legend {
    gap: 12px;
  }
  .panel-heading {
    flex-wrap: wrap;
  }
}
</style>
