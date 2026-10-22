<template>
  <NCard size="small">
    <template #header>
      <div class="flex items-center gap-2">
        <ChampionIcon :champion-id="report.analysis.metrics.championId ?? -1" class="size-12!" />
        <span
          >{{ resources.champions.name(report.analysis.metrics.championId ?? -1) }} ·
          {{ report.summary.gameId }}</span
        >
        <NTag
          size="small"
          :type="
            report.analysis.metrics.outcome === 'win'
              ? 'success'
              : report.analysis.metrics.outcome === 'loss'
                ? 'error'
                : 'default'
          "
        >
          {{ t(`outcomes.${report.analysis.metrics.outcome}`) }}
        </NTag>
      </div>
    </template>
    <div class="mb-3 flex flex-wrap gap-3 text-xs opacity-70">
      <span>{{ new Date(report.analysis.metrics.startedAt).toLocaleString() }}</span>
      <span>{{ resources.queues.name(report.analysis.metrics.queueId) }}</span>
      <span>{{ report.analysis.metrics.patch }} · {{ report.analysis.metrics.position }}</span>
      <span>{{ report.player.serverId }} · {{ report.summary.source.toUpperCase() }}</span>
    </div>
    <div class="mb-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
      <div
        v-for="item in [
          {
            icon: Bolt,
            label: t('kda'),
            value: `${report.analysis.metrics.kills ?? '—'} / ${report.analysis.metrics.deaths ?? '—'} / ${report.analysis.metrics.assists ?? '—'}`
          },
          {
            icon: Plant2,
            label: t('csPerMin'),
            value: report.analysis.metrics.csPerMin?.toFixed(1) ?? '—'
          },
          {
            icon: ChartBar,
            label: t('damageShare'),
            value:
              report.analysis.metrics.damageShare == null
                ? '—'
                : `${(report.analysis.metrics.damageShare * 100).toFixed(1)}%`
          },
          {
            icon: Coin,
            label: t('goldAt10'),
            value: goldAt10 == null ? '—' : `${goldAt10 > 0 ? '+' : ''}${goldAt10.toLocaleString()}`
          },
          { icon: Clock, label: t('duration'), value: formatGameTime(report.analysis.duration) }
        ]"
        :key="item.label"
        class="rounded-lg bg-(--la-card-muted-surface) p-3"
      >
        <div class="mb-2 flex items-center gap-2 text-xs opacity-65">
          <NIcon :component="item.icon" :size="18" aria-hidden="true" />{{ item.label }}
        </div>
        <span class="text-xl font-semibold tabular-nums">{{ item.value }}</span>
      </div>
    </div>
    <NCollapse
      ><NCollapseItem :title="t('finalItems')" name="items">
        <div class="flex flex-wrap items-center gap-2">
          <ItemDisplay
            v-for="(id, index) in items"
            :key="index"
            :item-id="id"
            :size="28"
          /></div></NCollapseItem
    ></NCollapse>
    <NAlert
      v-for="limitation in report.analysis.limitations"
      :key="limitation"
      class="mt-3"
      type="warning"
      :show-icon="false"
    >
      {{ t(limitation) }}
    </NAlert>
  </NCard>
</template>
<script setup lang="ts">
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { formatGameTime, type ReviewReport } from '@shared/pro/review'
import { useTranslation } from 'i18next-vue'
import { NAlert, NCard, NIcon, NTag, NCollapse, NCollapseItem } from 'naive-ui'
import { Bolt, Plant2, Clock, Coin, ChartBar } from '@vicons/tabler'
import { computed } from 'vue'
const props = defineProps<{ report: ReviewReport }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const resources = useGameResourceProvider()
const goldAt10 = computed(
  () => props.report.analysis.checkpoints.find((p) => p.target === 600_000)?.point?.goldDiff ?? null
)
const items = computed(
  () =>
    toParticipants(props.report.summary, toBasicInfo(props.report.summary)).find(
      (p) => p.puuid === props.report.player.puuid
    )?.items ?? []
)
</script>
