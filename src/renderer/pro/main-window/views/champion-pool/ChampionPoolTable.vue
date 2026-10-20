<template>
  <NDataTable
    remote
    :columns="columns"
    :data="items"
    :loading="loading"
    :row-key="(row: ChampionStats) => row.championId ?? 0"
    :bordered="false"
    :single-line="false"
    size="small"
    :scroll-x="700"
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
  ...(['winRate', 'kda', 'csPerMin', 'damageShare'] as const).map((key) => ({
    title: t(key),
    key,
    width: 110,
    ...sortable(key),
    render: (row: ChampionStats) => (
      <MetricValue
        metric={row[key]}
        ratio={key === 'winRate' || key === 'damageShare'}
        kda={key === 'kda'}
      />
    )
  }))
])
</script>
