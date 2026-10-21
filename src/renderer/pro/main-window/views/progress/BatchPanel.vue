<template>
  <div class="flex flex-col gap-3">
    <NSelect v-model:value="playerKey" :options="playerOptions" :placeholder="t('player')" />

    <div class="flex flex-wrap gap-2">
      <NButton :disabled="!matches.length" @click="selected = matches.map((m) => m.gameId)">{{
        t('selectPage')
      }}</NButton
      ><NButton :disabled="!selected.length || busy" @click="preview">{{
        t('prepare', { count: selected.length })
      }}</NButton>
    </div>
    <NCheckboxGroup v-model:value="selected"
      ><div class="flex flex-wrap gap-3">
        <NCheckbox v-for="match in matches" :key="match.gameId" :value="match.gameId"
          >{{ new Date(match.startedAt).toLocaleDateString() }} · {{ match.gameId }}</NCheckbox
        >
      </div></NCheckboxGroup
    >
    <div class="flex gap-2">
      <NButton :disabled="page === 1" @click="page--">{{ t('previous') }}</NButton
      ><span>{{ page }}</span
      ><NButton :disabled="matches.length < 30" @click="page++">{{ t('next') }}</NButton>
    </div>
    <NCard
      v-for="batch in batches"
      :key="batch.id"
      size="small"
      :title="new Date(batch.updatedAt).toLocaleString()"
    >
      <template #header-extra
        ><NTag>{{ t(`states.${batch.state}`) }}</NTag></template
      >
      <div class="flex items-center gap-3">
        <span
          >{{ batch.items.filter((i) => i.state === 'ready').length }} /
          {{ batch.items.length }}</span
        ><NButton v-if="batch.state === 'running'" :disabled="busy" @click="cancel">{{
          t('cancel')
        }}</NButton
        ><NButton
          v-else-if="batch.state !== 'completed'"
          :disabled="busy || batches.some((b) => b.state === 'running')"
          @click="run(batch.id)"
          >{{ t(batch.state === 'preview' ? 'start' : 'resume') }}</NButton
        >
      </div>
      <NCollapse class="mt-2"
        ><NCollapseItem :title="t('matches')" :name="batch.id"
          ><div class="flex flex-wrap gap-3">
            <NButton
              v-for="item in batch.items"
              :key="item.gameId"
              text
              size="small"
              :disabled="!item.reportId"
              @click="router.push({ name: REVIEW_ROUTE, query: { id: item.reportId } })"
              >{{ item.gameId }} · {{ t(`states.${item.state}`) }}</NButton
            >
          </div></NCollapseItem
        ></NCollapse
      >
    </NCard>
  </div>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import { computed, ref, shallowRef, watch, onActivated, onDeactivated, onScopeDispose } from 'vue'
import {
  NSelect,
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NCard,
  NTag,
  NCollapse,
  NCollapseItem
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useRouter } from 'vue-router'
import { useInstance } from '@renderer-shared/shards'
import type { PoolPlayer } from '@shared/pro/champion-pool'
import type { ReviewBatch } from '@shared/pro/progress'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { ProgressRenderer } from '../../../shared/shards/progress'
import { ChampionPoolRenderer } from '../../../shared/shards/champion-pool'
const api = useInstance(ProgressRenderer),
  pool = useInstance(ChampionPoolRenderer),
  router = useRouter(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const players = shallowRef<PoolPlayer[]>([]),
  playerKey = ref<string | null>(null),
  page = ref(1),
  selected = ref<number[]>([]),
  matches = shallowRef<{ gameId: number; startedAt: number; championId: number }[]>([]),
  batches = shallowRef<ReviewBatch[]>([]),
  error = ref(false),
  busy = ref(false)
const playerOptions = computed(() =>
    players.value.map((p) => ({
      value: JSON.stringify([p.serverId, p.puuid]),
      label: `${p.name} · ${p.serverId}`
    }))
  ),
  player = computed(() =>
    players.value.find((p) => JSON.stringify([p.serverId, p.puuid]) === playerKey.value)
  )
let generation = 0,
  pollGeneration = 0,
  stopped = true,
  timer: ReturnType<typeof setTimeout> | undefined
useQueryCache(
  () => JSON.stringify([playerKey.value, page.value]),
  matches,
  () => []
)
watch(
  [playerKey, page],
  () => {
    selected.value = []
  },
  { flush: 'sync' }
)
async function load() {
  const g = ++generation
  error.value = false
  if (!player.value) return
  try {
    const next = await api.candidates(player.value, page.value)
    if (g === generation) matches.value = next
  } catch {
    if (g === generation) error.value = true
  }
}
async function poll() {
  clearTimeout(timer)
  if (stopped) return
  const current = ++pollGeneration
  error.value = false
  try {
    const next = await api.batches()
    if (!stopped && current === pollGeneration) batches.value = next
  } catch {
    if (!stopped && current === pollGeneration) error.value = true
  } finally {
    if (!stopped && current === pollGeneration) timer = setTimeout(poll, 2000)
  }
}
async function action(fn: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = false
  try {
    await fn()
    batches.value = await api.batches()
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
function preview() {
  if (player.value) return action(() => api.preview({ ...player.value!, gameIds: selected.value }))
  return undefined
}
function run(id: string) {
  return action(() => api.runBatch(id))
}
function cancel() {
  return action(() => api.cancel())
}
watch(playerKey, () => {
  page.value = 1
  void load()
})
watch(page, load)
onActivated(async () => {
  stopped = false
  try {
    players.value = await pool.players()
    if (!stopped) {
      playerKey.value = playerOptions.value.some((p) => p.value === playerKey.value)
        ? playerKey.value
        : (playerOptions.value[0]?.value ?? null)
      void load()
      void poll()
    }
  } catch {
    error.value = true
  }
})
onDeactivated(() => {
  stopped = true
  pollGeneration++
  generation++
  clearTimeout(timer)
})
onScopeDispose(() => {
  stopped = true
  pollGeneration++
  generation++
  clearTimeout(timer)
})
useRefreshFeedback(
  () => error.value,
  () => t('failed')
)
</script>
