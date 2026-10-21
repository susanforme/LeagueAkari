<template>
  <NDataTable
    remote
    :columns="columns"
    :data="items"
    :loading="loading"
    :row-key="(row: ChampionStats) => row.championId ?? 0"
    :bordered="false"
    :single-line="true"
    size="small"
    :scroll-x="1200"
    @update:sorter="updateSorter"
  />
</template>

<script setup lang="tsx">
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { ChampionStats, PoolQuery } from '@shared/pro/champion-pool'
import { useTranslation } from 'i18next-vue'
import {
  NButton,
  NDataTable,
  type DataTableColumns,
  type DataTableBaseColumn,
  type DataTableSortState
} from 'naive-ui'
import { computed } from 'vue'

import MetricValue from './MetricValue.vue'

const props = defineProps<{
  items: ChampionStats[]
  loading: boolean
  sort: PoolQuery['sort']
  sortDirection: PoolQuery['sortDirection']
}>()
const emit = defineEmits<{
  select: [id: number]
  sort: [field: PoolQuery['sort'], direction: PoolQuery['sortDirection']]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const { t: common } = useTranslation('common')
const resources = useGameResourceProvider()
function sortable(
  key: PoolQuery['sort']
): Pick<DataTableBaseColumn<ChampionStats>, 'sorter' | 'sortOrder' | 'customNextSortOrder'> {
  return {
    sorter: true,
    sortOrder: props.sort === key ? (props.sortDirection === 'asc' ? 'ascend' : 'descend') : false,
    customNextSortOrder: (order) => (order === 'descend' ? 'ascend' : 'descend')
  }
}
function updateSorter(state: DataTableSortState | DataTableSortState[] | null) {
  if (!state || Array.isArray(state) || !state.order) return
  emit('sort', state.columnKey as PoolQuery['sort'], state.order === 'ascend' ? 'asc' : 'desc')
}
const columns = computed<DataTableColumns<ChampionStats>>(() => [
  {
    title: t('champion'),
    key: 'championId',
    width: 190,
    render: (row) => (
      <NButton
        text
        disabled={!row.championId}
        onClick={() => emit('select', row.championId!)}
        aria-label={resources.champions.name(row.championId ?? -1)}
      >
        <span class="flex items-center gap-2">
          <ChampionIcon championId={row.championId ?? -1} class="size-8! rounded" />
          {row.championId ? resources.champions.name(row.championId) : t('unknownChampion')}
        </span>
      </NButton>
    )
  },
  { title: t('games'), key: 'games', width: 90, ...sortable('games') },
  ...(
    ['winRate', 'kda', 'csPerMin', 'damageShare', 'killParticipation', 'visionPerMin'] as const
  ).map((key) => ({
    title: t(key),
    key,
    width: 110,
    ...sortable(key),
    render: (row: ChampionStats) => (
      <div class="table-metric">
        <MetricValue
          metric={row[key]}
          ratio={key === 'winRate' || key === 'damageShare' || key === 'killParticipation'}
          kda={key === 'kda'}
        />
        <span class="metric-bar" aria-hidden="true">
          <i
            style={{
              width: `${Math.min(100, (Math.max(0, row[key].value ?? 0) / { winRate: 1, kda: 6, csPerMin: 10, damageShare: 0.5, killParticipation: 1, visionPerMin: 2 }[key]) * 100)}%`
            }}
          />
        </span>
      </div>
    )
  })),
  {
    title: t('position'),
    key: 'position',
    width: 95,
    render: (row) =>
      row.position === 'UNKNOWN' ? t('unknownPosition') : common(`positions.${row.position}`)
  },
  {
    title: t('lastPlayed'),
    key: 'lastPlayed',
    width: 130,
    ...sortable('lastPlayed'),
    render: (row) => (row.lastPlayed === null ? '—' : new Date(row.lastPlayed).toLocaleDateString())
  }
])
</script>

<style scoped>
:deep(.table-metric) {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
:deep(.metric-bar) {
  display: block;
  width: 72px;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--la-card-muted-surface);
}
:deep(.metric-bar i) {
  display: block;
  height: 100%;
  background: #24a887;
  opacity: 0.8;
}
:deep(.n-data-table-th) {
  font-size: 12px;
}
:deep(.n-data-table-td) {
  font-size: 12px;
}
</style>
