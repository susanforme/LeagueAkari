<template>
  <NPopover v-if="available" v-model:show="open" trigger="click" placement="bottom-end">
    <template #trigger
      ><NButton size="tiny" quaternary :type="warning || failed ? 'warning' : 'default'">{{
        t('title')
      }}</NButton></template
    >
    <div class="w-96 max-w-[80vw]">
      <LoadoutPanel v-if="open" />
    </div>
  </NPopover>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { NButton, NPopover, useNotification, type NotificationReactive } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import { selectedLoadoutChampion } from '@shared/pro/notebook/loadout'
import { NotebookRenderer } from '../../../shared/shards/notebook'
import LoadoutPanel from './LoadoutPanel.vue'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.loadout' })
const api = useInstance(NotebookRenderer),
  league = useLeagueClientStore(),
  sgp = useSgpStore(),
  notification = useNotification()
const available = computed(
  () =>
    league.isConnected &&
    league.gameflow.phase === 'ChampSelect' &&
    !!selectedLoadoutChampion(league.champSelect.session)
)
const open = ref(false),
  warning = ref(false),
  failed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0,
  disposed = false,
  lastWarning = ''
let shown: NotificationReactive | undefined
async function poll() {
  clearTimeout(timer)
  const current = ++generation
  if (!available.value) return
  try {
    const status = await api.loadoutStatus()
    if (disposed || current !== generation) return
    failed.value = false
    const problems = (['runes', 'spells', 'items'] as const).filter(
      (p) => !['matched', 'skipped'].includes(status.parts[p])
    )
    warning.value =
      !status.busy &&
      ((!!status.entryId && (!!status.issue || problems.length > 0)) ||
        status.flash === 'mismatch' ||
        status.flash === 'failed')
    if (!warning.value) {
      shown?.destroy()
      shown = undefined
      lastWarning = ''
    } else {
      const signature = JSON.stringify([
        status.context?.key,
        status.entryId,
        status.issue,
        status.flash,
        problems.map((p) => [p, status.parts[p]])
      ])
      if (signature !== lastWarning) {
        shown?.destroy()
        lastWarning = signature
        shown = notification.warning({
          title: status.entryId ? t('warning', { title: status.title }) : t('flashSlot'),
          content: [
            status.issue ? t(status.issue) : '',
            status.flash === 'mismatch'
              ? t('flashMismatch')
              : status.flash === 'failed'
                ? t('flashFailed')
                : '',
            ...problems.map((p) => `${t(p)} · ${t(`states.${status.parts[p]}`)}`)
          ]
            .filter(Boolean)
            .join('；'),
          duration: 8000
        })
      }
    }
  } catch {
    if (!disposed && current === generation) failed.value = true
  } finally {
    if (!disposed && current === generation) timer = setTimeout(poll, 2000)
  }
}
watch(
  () =>
    JSON.stringify([
      available.value,
      league.auth?.pid,
      league.summoner.me?.puuid,
      sgp.availability.sgpServerId,
      league.champSelect.session?.id,
      league.champSelect.session?.gameId,
      selectedLoadoutChampion(league.champSelect.session)
    ]),
  () => {
    generation++
    clearTimeout(timer)
    shown?.destroy()
    shown = undefined
    lastWarning = ''
    warning.value = false
    failed.value = false
    if (!available.value) open.value = false
    void poll()
  },
  { immediate: true }
)
onScopeDispose(() => {
  disposed = true
  generation++
  clearTimeout(timer)
  shown?.destroy()
})
</script>
