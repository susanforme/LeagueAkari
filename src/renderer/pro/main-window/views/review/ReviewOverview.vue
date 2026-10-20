<template>
  <NCard size="small">
    <template #header>
      <div class="flex items-center gap-2">
        <ChampionIcon :champion-id="report.analysis.metrics.championId ?? -1" class="size-9!" />
        <span
          >{{ resources.champions.name(report.analysis.metrics.championId ?? -1) }} ·
          {{ report.summary.gameId }}</span
        >
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
      ><NCollapseItem :title="tv('checkpoints')" name="checkpoints"
        ><NScrollbar x-scrollable>
          <NTable size="small" :single-line="false">
            <thead>
              <tr>
                <th>{{ t('checkpoint') }}</th>
                <th>{{ t('gold') }}</th>
                <th>{{ t('cs') }}</th>
                <th>{{ t('xp') }}</th>
                <th>{{ t('goldDiff') }}</th>
                <th>{{ t('csDiff') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="checkpoint in report.analysis.checkpoints" :key="checkpoint.target">
                <td>
                  <NButton text size="small" @click="$emit('locate', checkpoint.target)">{{
                    formatGameTime(checkpoint.target)
                  }}</NButton>
                  <div class="text-xs opacity-60">
                    {{ checkpoint.point ? formatGameTime(checkpoint.point.timestamp) : '—' }}
                  </div>
                </td>
                <td v-for="key in keys" :key="key">{{ checkpoint.point?.[key] ?? '—' }}</td>
              </tr>
            </tbody>
          </NTable>
          <div class="mt-2 text-xs opacity-60">{{ t('checkpointHelp') }}</div>
        </NScrollbar></NCollapseItem
      ></NCollapse
    >
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-xs">{{ t('finalItems') }}</span>
      <ItemDisplay v-for="(id, index) in items" :key="index" :item-id="id" :size="28" />
    </div>
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
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { formatGameTime, type ReviewReport } from '@shared/pro/review'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NCard,
  NTable,
  NIcon,
  NCollapse,
  NCollapseItem,
  NScrollbar
} from 'naive-ui'
import { Bolt, Plant2, Clock } from '@vicons/tabler'
import { computed } from 'vue'
const props = defineProps<{ report: ReviewReport }>()
defineEmits<{ locate: [timestamp: number] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const { t: tv } = useTranslation(undefined, { keyPrefix: 'pro.visual' })
const resources = useGameResourceProvider()
const keys = ['gold', 'cs', 'xp', 'goldDiff', 'csDiff'] as const
const items = computed(
  () =>
    toParticipants(props.report.summary, toBasicInfo(props.report.summary)).find(
      (p) => p.puuid === props.report.player.puuid
    )?.items ?? []
)
</script>
