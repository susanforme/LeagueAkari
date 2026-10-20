<template>
  <div class="experience-tools flex items-center gap-2">
    <NButton size="tiny" quaternary @click="searchOpen = true">{{ t('search') }} ⌘/Ctrl K</NButton>
    <SceneMenu />
    <NPopover trigger="click" placement="bottom-end">
      <template #trigger
        ><NButton size="tiny" quaternary :type="failed ? 'warning' : 'default'"
          >{{ t('tasks') }}<span v-if="busy"> ···</span></NButton
        ></template
      >
      <div class="flex max-w-80 flex-col gap-3">
        <span>{{
          t(
            !store.status?.account ? 'waiting' : busy ? 'syncing' : failed ? 'partial' : 'connected'
          )
        }}</span>
        <span v-if="poolStatus?.sync.running"
          >{{ poolStatus.sync.processed }} / {{ poolStatus.sync.requested }}</span
        >
        <NAlert v-if="store.status?.archiveError || poolStatus?.sync.error" type="warning">{{
          t('partial')
        }}</NAlert>
        <NButton
          v-if="store.error || store.status?.archiveError || poolStatus?.sync.error"
          size="small"
          :loading="retrying"
          @click="retry"
          >{{ t('retry') }}</NButton
        >
        <NAlert v-if="store.error" type="warning">{{ t('failed') }}</NAlert>
        <div v-for="batch in tasks" :key="batch.id" class="flex items-center gap-2">
          <span
            >{{ t('review') }} ·
            {{ batch.items.filter((item) => item.state === 'ready').length }}/{{
              batch.items.length
            }}
            · {{ workshopT(`states.${batch.state}`) }}</span
          >
          <NButton
            v-if="batch.state !== 'running'"
            size="tiny"
            :disabled="retrying"
            @click="retryBatch(batch.id)"
            >{{ t('retry') }}</NButton
          >
        </div>
      </div>
    </NPopover>
    <PlayReminder />
    <QuickSearch v-model:show="searchOpen" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NPopover, NAlert } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { pageNames, type Workspace } from '@shared/pro/experience'
import type { PoolStatus } from '@shared/pro/champion-pool'
import { ExperienceRenderer } from '../../shared/shards/experience'
import { useExperienceStore } from '../../shared/shards/experience/store'
import { ChampionPoolRenderer } from '../../shared/shards/champion-pool'
import QuickSearch from './QuickSearch.vue'
import SceneMenu from './SceneMenu.vue'
import PlayReminder from './PlayReminder.vue'
import { ProgressRenderer } from '../../shared/shards/progress'
import type { ReviewBatch } from '@shared/pro/progress'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const { t: workshopT } = useTranslation(undefined, { keyPrefix: 'pro.workshop' })
const api = useInstance(ExperienceRenderer),
  pool = useInstance(ChampionPoolRenderer)
const progress = useInstance(ProgressRenderer),
  tasks = shallowRef<ReviewBatch[]>([])
const store = useExperienceStore(),
  league = useLeagueClientStore(),
  router = useRouter()
const searchOpen = ref(false),
  retrying = ref(false),
  poolStatus = shallowRef<PoolStatus | null>(null)
const busy = computed(
  () =>
    poolStatus.value?.sync.running ||
    store.status?.archiving ||
    tasks.value.some((b) => b.state === 'running')
)
const failed = computed(
  () =>
    store.error ||
    store.status?.archiveError ||
    poolStatus.value?.sync.error ||
    tasks.value.some((b) => b.state !== 'running')
)
let timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false,
  polling = false
let saving = Promise.resolve(),
  loadedKey: string | null = null
function persist() {
  if (!store.ready || store.restoring || !store.status?.preferences.restore || !loadedKey) return
  const key = loadedKey,
    workspace = JSON.parse(JSON.stringify(store.workspace))
  saving = saving
    .then(() => api.saveWorkspace(key, workspace))
    .catch(() => {
      store.error = true
    })
}
watch(() => store.workspace, persist, { deep: true })
const removeRouteHook = router.afterEach((to) => {
  if (!store.ready || store.restoring || !pageNames.includes(to.name as Workspace['route'])) return
  store.workspace.route = to.name as Workspace['route']
  store.workspace.query = JSON.parse(JSON.stringify(to.query))
})
async function poll() {
  if (polling || disposed) return
  clearTimeout(timer)
  polling = true
  try {
    const [status, nextPool] = await Promise.all([api.status(), pool.status()])
    if (disposed) return
    poolStatus.value = nextPool
    let taskFailure = false
    try {
      tasks.value = (await progress.batches())
        .filter(
          (b) =>
            ['running', 'partial', 'interrupted'].includes(b.state) &&
            (!status.account ||
              (b.player.puuid === status.account.puuid &&
                b.player.serverId === status.account.serverId))
        )
        .slice(0, 5)
    } catch {
      taskFailure = true
    }
    if (loadedKey !== status.accountKey) {
      persist()
      await saving
      store.restoring = true
      store.ready = false
      const saved = await api.workspace(status.accountKey)
      if (disposed) return
      store.status = status
      loadedKey = status.accountKey
      store.workspace = saved ?? { route: 'pro-profile', query: {}, pages: {} }
      if (
        status.preferences.restore &&
        (saved || status.account) &&
        router.currentRoute.value.name !== 'ongoing-game'
      ) {
        await router.replace({ name: store.workspace.route, query: store.workspace.query })
      }
      store.ready = true
      store.revision++
      await nextTick()
      store.restoring = false
    } else store.status = status
    store.error = taskFailure
  } catch {
    if (!disposed) store.error = true
    store.restoring = false
  } finally {
    polling = false
    if (!disposed) timer = setTimeout(poll, 3000)
  }
}
async function retry() {
  retrying.value = true
  try {
    if (store.status?.archiveError) await api.archive()
    else if (poolStatus.value?.sync.error) await pool.retrySync()
    await poll()
  } catch {
    store.error = true
  } finally {
    retrying.value = false
  }
}
async function retryBatch(id: string) {
  retrying.value = true
  try {
    await progress.runBatch(id)
    await poll()
  } catch {
    store.error = true
  } finally {
    retrying.value = false
  }
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
    event.preventDefault()
    searchOpen.value = !searchOpen.value
  }
}
watch(
  () => [league.isConnected, league.summoner.me?.puuid],
  () => void poll()
)
onMounted(() => {
  void poll()
  window.addEventListener('keydown', shortcut)
})
onScopeDispose(() => {
  disposed = true
  clearTimeout(timer)
  removeRouteHook()
  window.removeEventListener('keydown', shortcut)
})
</script>
<style scoped>
.experience-tools {
  -webkit-app-region: no-drag;
}
</style>
