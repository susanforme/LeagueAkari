<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="t('search')"
    class="w-[640px]!"
    :z-index="1000010"
  >
    <NInput
      ref="input"
      v-model:value="query"
      clearable
      :placeholder="t('searchPlaceholder')"
      :aria-label="t('search')"
      @keydown="keydown"
    />
    <NAlert v-if="failed" type="warning" class="mt-3"
      >{{ t('partial') }} <NButton text @click="load">{{ t('retry') }}</NButton></NAlert
    >
    <NScrollbar style="max-height: 420px" class="mt-3">
      <div class="flex flex-col gap-1" role="listbox" :aria-label="t('search')">
        <NButton
          v-for="(item, index) in results"
          :key="item.key"
          :type="cursor === index ? 'primary' : 'default'"
          quaternary
          class="justify-start!"
          role="option"
          :aria-selected="cursor === index"
          @click="choose(item)"
        >
          <span class="mr-3 opacity-50">{{ t(item.kind) }}</span
          >{{ item.label }}
        </NButton>
        <NEmpty v-if="!results.length && !loading" :description="t('empty')" />
      </div>
    </NScrollbar>
  </NModal>
</template>
<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { NModal, NInput, NScrollbar, NButton, NAlert, NEmpty, type InputInst } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useRouter } from 'vue-router'
import { useInstance } from '@renderer-shared/shards'
import { PlayerTabsRenderer } from '@main-window/shards/player-tabs'
import { useMainWindowAppContext } from '@main-window/context'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useChampionPoolResources } from '../views/champion-pool/useChampionPoolResources'
import type { SearchRecords } from '@shared/pro/experience'
const show = defineModel<boolean>('show', { required: true })
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const { t: allT } = useTranslation()
const api = useInstance(ExperienceRenderer),
  tabs = useInstance(PlayerTabsRenderer),
  router = useRouter()
const { openSettingsModal } = useMainWindowAppContext()
const { catalog } = useChampionPoolResources()
const query = ref(''),
  input = ref<InputInst>(),
  cursor = ref(0),
  loading = ref(false),
  failed = ref(false)
const records = shallowRef<SearchRecords>({ notes: [], reports: [] })
const visits = shallowRef<Awaited<ReturnType<typeof tabs.getSearchHistory>>>([])
const championIds = computed(() =>
  Object.keys(catalog.value.champions)
    .filter((id) =>
      `${catalog.value.champions[id]} ${catalog.value.championSearch?.[id] ?? ''} ${id}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase())
    )
    .map(Number)
    .slice(0, 200)
)
interface Result {
  key: string
  kind: string
  label: string
  run: () => unknown
}
const results = computed<Result[]>(() => {
  const text = query.value.trim().toLowerCase()
  const settings = [
    ['basic', 'settings.app.title'],
    ['player-tabs', 'settings.matchHistory.title'],
    ['ongoing-game', 'settings.ongoingGame.title'],
    ['multi-window', 'settings.multiWindow.title'],
    ['pro', 'pro.workshop.settingsTab'],
    ['storage', 'settings.storage.title']
  ].map(([tab, key]) => ({
    key: `settings:${tab}`,
    kind: 'settings',
    label: allT(key),
    run: () => openSettingsModal(tab)
  }))
  const settingItems = [
    ['basic', 'settings.app.basic.theme.label'],
    ['basic', 'settings.app.basic.preferredLolSource.label'],
    ['misc', 'settings.misc.streamerMode.streamerMode.label'],
    ['misc', 'settings.misc.streamerMode.contentProtection.label'],
    ['pro', 'pro.experience.restore'],
    ['pro', 'pro.experience.archive']
  ].map(([tab, key]) => ({
    key,
    kind: 'settings',
    label: allT(key),
    run: () => focusSetting(tab, allT(key))
  }))
  const automation = [
    'autoAcceptEnabled',
    'autoHonorEnabled',
    'playAgainEnabled',
    'autoMatchmakingEnabled',
    'autoReconnectEnabled'
  ].map((key) => {
    const label = allT(`automation.gameflow.${key}.label`)
    return {
      key,
      kind: 'settings',
      label,
      run: async () => {
        await router.push({ name: 'automation', params: { section: 'auto-gameflow' } })
        await focusLabel(label)
      }
    }
  })
  return [
    ...[...settingItems, ...automation, ...settings].filter(
      (s) => !text || s.label.toLowerCase().includes(text)
    ),
    ...championIds.value.slice(0, 12).map((id) => ({
      key: `champ:${id}`,
      kind: 'champion',
      label: catalog.value.champions[id],
      run: () => router.push({ name: 'pro-champion-pool', query: { champion: id } })
    })),
    ...visits.value
      .filter((p) => `${p.summoner.gameName}#${p.summoner.tagLine}`.toLowerCase().includes(text))
      .slice(0, 12)
      .map((p) => ({
        key: `${p.sgpServerId}:${p.puuid}`,
        kind: 'player',
        label: `${p.summoner.gameName}#${p.summoner.tagLine} · ${p.sgpServerId}`,
        run: () =>
          router.push({
            name: 'player-tabs',
            params: { puuid: p.puuid, sgpServerId: p.sgpServerId }
          })
      })),
    ...records.value.notes.map((n) => ({
      key: n.id,
      kind: 'notebook',
      label: n.title,
      run: () =>
        router.push({ name: 'pro-notebook', query: { champion: n.championId, search: n.title } })
    })),
    ...records.value.reports.map((r) => ({
      key: r.id,
      kind: 'review',
      label: `${catalog.value.champions[r.championId] ?? r.championId} · ${r.gameId} · ${new Date(r.startedAt).toLocaleDateString()}`,
      run: () => router.push({ name: 'pro-review', query: { id: r.id } })
    }))
  ]
})
async function focusLabel(label: string) {
  await nextTick()
  const row = [...document.querySelectorAll<HTMLElement>('.settings-row-label-main')].find(
    (node) => node.textContent?.trim() === label && node.getClientRects().length
  )
  row?.scrollIntoView({ block: 'center' })
  row?.closest('.settings-row')?.querySelector<HTMLElement>('button,input,[tabindex="0"]')?.focus()
}
async function focusSetting(tab: string, label: string) {
  openSettingsModal(tab)
  await focusLabel(label)
}
let epoch = 0,
  timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const current = ++epoch
  loading.value = true
  const values = await Promise.allSettled([
    api.search(query.value, championIds.value),
    tabs.getSearchHistory()
  ])
  if (current !== epoch || !show.value) return
  if (values[0].status === 'fulfilled') records.value = values[0].value
  if (values[1].status === 'fulfilled') visits.value = values[1].value
  failed.value = values.some((v) => v.status === 'rejected')
  loading.value = false
}
function choose(item: Result) {
  show.value = false
  void item.run()
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    cursor.value =
      (cursor.value + (event.key === 'ArrowDown' ? 1 : -1) + results.value.length) %
      Math.max(1, results.value.length)
  } else if (event.key === 'Enter' && results.value[cursor.value]) {
    event.preventDefault()
    choose(results.value[cursor.value])
  }
}
watch([query, championIds], () => {
  cursor.value = 0
  epoch++
  clearTimeout(timer)
  if (show.value) timer = setTimeout(load, 180)
})
watch(show, async (value) => {
  epoch++
  clearTimeout(timer)
  if (value) {
    query.value = ''
    cursor.value = 0
    void load()
    await nextTick()
    input.value?.focus()
  }
})
onScopeDispose(() => {
  epoch++
  clearTimeout(timer)
})
</script>
