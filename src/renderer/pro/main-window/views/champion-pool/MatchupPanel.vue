<template>
  <NCard size="small" :title="t('title')">
    <template #header-extra
      ><NButton size="small" :loading="loading" @click="load">{{ t('refresh') }}</NButton></template
    >
    <NAlert v-if="error" type="error">{{ t('failed') }}</NAlert>
    <NSpin :show="loading">
      <div class="flex flex-col gap-3">
        <NAlert v-if="result?.truncated" type="warning">{{ poolT('truncated') }}</NAlert>
        <span v-if="result?.excluded" class="text-xs opacity-60">{{
          t('excluded', { count: result.excluded })
        }}</span>
        <NEmpty v-if="result && !result.items.length" :description="t('empty')" />
        <NScrollbar v-else x-scrollable style="max-height: 330px">
          <NTable size="small" :single-line="false">
            <thead>
              <tr>
                <th>{{ t('opponent') }}</th>
                <th>{{ poolT('games') }}</th>
                <th>{{ poolT('winRate') }}</th>
                <th>{{ t('gold10') }}</th>
                <th>{{ t('cs10') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in result?.items" :key="row.opponentId">
                <td>
                  <NButton
                    text
                    :type="opponentId === row.opponentId ? 'primary' : 'default'"
                    @click="opponentId = row.opponentId"
                  >
                    <ChampionIcon :champion-id="row.opponentId" class="mr-2 size-10! rounded" />{{
                      resources.champions.name(row.opponentId)
                    }}
                  </NButton>
                </td>
                <td>{{ row.games }}</td>
                <td><MatchupMetric :metric="row.winRate" ratio /></td>
                <td><MatchupMetric :metric="row.goldDiff10" :scale="goldScale" /></td>
                <td><MatchupMetric :metric="row.csDiff10" :scale="csScale" /></td>
              </tr>
            </tbody>
          </NTable>
        </NScrollbar>
        <template v-if="opponentId">
          <MatchupBrief
            v-if="query.championId"
            :champion-id="query.championId"
            :opponent-id="opponentId"
          />
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <ChampionIcon :champion-id="query.championId ?? -1" class="size-10! rounded" /><NIcon
                :component="Bolt"
                :size="20"
                aria-hidden="true"
              /><ChampionIcon :champion-id="opponentId" class="size-10! rounded" /><span
                class="font-bold"
                >{{ t('against', { name: resources.champions.name(opponentId) }) }}</span
              >
            </div>
            <NButton
              size="small"
              @click="
                router.push({
                  name: NOTEBOOK_ROUTE,
                  query: { champion: query.championId, opponent: opponentId }
                })
              "
              >{{ t('notes') }}</NButton
            >
          </div>
          <div
            v-for="match in result?.matches"
            :key="match.gameId"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <span
              >{{ new Date(match.startedAt).toLocaleString() }} ·
              {{ t(`outcomes.${match.outcome}`) }}</span
            >
            <NButton
              size="tiny"
              @click="
                router.push({
                  name: REVIEW_ROUTE,
                  query: match.reportId
                    ? { id: match.reportId }
                    : { serverId: query.serverId, puuid: query.puuid, gameId: match.gameId }
                })
              "
              >{{ t('review') }}</NButton
            >
          </div>
          <NPagination
            v-if="result && result.matchCount > 10"
            v-model:page="page"
            :page-size="10"
            :item-count="result.matchCount"
            :disabled="loading"
          />
        </template>
      </div>
    </NSpin>
  </NCard>
</template>
<script setup lang="ts">
import {
  computed,
  ref,
  shallowRef,
  watch,
  onMounted,
  onActivated,
  onDeactivated,
  onScopeDispose
} from 'vue'
import { Bolt } from '@vicons/tabler'
import { useRouter } from 'vue-router'
import {
  NIcon,
  NCard,
  NButton,
  NTable,
  NAlert,
  NEmpty,
  NScrollbar,
  NSpin,
  NPagination
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import type { PoolMatchQuery } from '@shared/pro/champion-pool'
import type { MatchupResult } from '@shared/pro/champion-pool/matchups'
import { NOTEBOOK_ROUTE } from '@shared/pro/notebook'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
import MatchupMetric from './MatchupMetric.vue'
import MatchupBrief from './MatchupBrief.vue'
const props = defineProps<{ query: PoolMatchQuery }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.matchups' })
const { t: poolT } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const api = useInstance(ChampionPoolRenderer),
  resources = useGameResourceProvider(),
  router = useRouter()
const result = shallowRef<MatchupResult | null>(null),
  opponentId = ref<number | null>(null),
  page = ref(1),
  loading = ref(false),
  error = ref(false)
const goldScale = computed(() =>
  Math.max(1, ...(result.value?.items ?? []).map((row) => Math.abs(row.goldDiff10.value ?? 0)))
)
const csScale = computed(() =>
  Math.max(1, ...(result.value?.items ?? []).map((row) => Math.abs(row.csDiff10.value ?? 0)))
)
let active = false,
  generation = 0
async function load() {
  const current = ++generation
  if (!active) return
  loading.value = true
  error.value = false
  try {
    const next = await api.matchups({
      ...props.query,
      opponentId: opponentId.value,
      page: page.value,
      pageSize: 10
    })
    if (current === generation) result.value = next
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => props.query,
  () => {
    generation++
    result.value = null
    opponentId.value = null
    page.value = 1
    void load()
  },
  { deep: true }
)
watch(opponentId, () => {
  page.value = 1
})
watch([opponentId, page], () => {
  result.value = result.value ? { ...result.value, matches: [] } : null
  void load()
})
function activate() {
  if (!active) {
    active = true
    void load()
  }
}
function deactivate() {
  active = false
  generation++
  loading.value = false
}
onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onScopeDispose(deactivate)
</script>
