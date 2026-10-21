<template>
  <NCard size="small">
    <template #header
      ><span class="flex items-center gap-2"
        ><NIcon :component="Target" :size="20" />{{ t('title') }}</span
      ></template
    >
    <template #header-extra><RefreshButton @click="load" /></template>

    <div class="flex flex-col gap-3">
      <div
        v-for="item in result?.items"
        :key="JSON.stringify(item.player)"
        class="flex flex-col gap-3 rounded-lg border border-(--la-color-popover-border) p-3"
      >
        <template v-if="item.plan.focus">
          <div class="flex items-center gap-2">
            <ChampionIcon
              :champion-id="item.plan.focus.championId"
              class="size-11! shrink-0 rounded-lg"
            /><span class="text-xs opacity-60">{{ item.player.serverId }}</span
            ><span class="break-words">{{ item.plan.focus.text }}</span>
          </div>
          <div class="flex gap-3">
            <NButton text size="tiny" @click="locate(item)">{{ t('evidence') }}</NButton>
            <NButton size="tiny" :disabled="saving" @click="finish(item)">{{
              t('complete')
            }}</NButton>
          </div>
        </template>
      </div>
      <NEmpty v-if="result && !result.total" :description="t('empty')" />
      <NPagination
        v-if="result && result.total > 10"
        v-model:page="page"
        :page-size="10"
        :item-count="result.total"
        :disabled="loading || saving"
      />
    </div>
  </NCard>
</template>
<script setup lang="ts">
import { useQueryCache } from '../../../shared/composables/query-cache'

import { useRefreshFeedback } from '../../../shared/composables/useRefreshFeedback'
import RefreshButton from '../../../shared/components/RefreshButton.vue'
import { ref, shallowRef, watch, onActivated, onDeactivated, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NButton, NEmpty, NPagination, NIcon } from 'naive-ui'
import { Target } from '@vicons/tabler'
import { useTranslation } from 'i18next-vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useInstance } from '@renderer-shared/shards'
import type { FocusPage } from '@shared/pro/experience/plan'
import { REVIEW_ROUTE } from '@shared/pro/review'
import { ExperienceRenderer } from '../../../shared/shards/experience'
const api = useInstance(ExperienceRenderer),
  router = useRouter()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.focusGoal' })
const page = ref(1),
  result = shallowRef<FocusPage | null>(null),
  loading = ref(false),
  saving = ref(false),
  error = ref(false)
let generation = 0,
  disposed = false
useQueryCache(
  () => String(page.value),
  result,
  () => null
)
async function load() {
  const current = ++generation
  loading.value = true
  error.value = false
  try {
    const next = await api.focuses(page.value)
    if (!disposed && current === generation) result.value = next
  } catch {
    if (!disposed && current === generation) error.value = true
  } finally {
    if (!disposed && current === generation) loading.value = false
  }
}
function locate(item: FocusPage['items'][number]) {
  if (item.plan.focus)
    void router.push({
      name: REVIEW_ROUTE,
      query: { id: item.plan.focus.reportId, time: item.plan.focus.timestamp }
    })
}
async function finish(item: FocusPage['items'][number]) {
  if (saving.value) return
  saving.value = true
  try {
    await api.changePlan({
      player: item.player,
      revision: item.plan.revision,
      action: { kind: 'clearFocus' }
    })
    if (!disposed) {
      if (result.value?.items.length === 1 && page.value > 1) page.value--
      else await load()
    }
  } catch {
    if (!disposed) error.value = true
  } finally {
    saving.value = false
  }
}
watch(page, load)
onActivated(load)
onDeactivated(() => {
  generation++
})
onScopeDispose(() => {
  disposed = true
  generation++
})
useRefreshFeedback(
  () => error.value,
  () => t('failed')
)
</script>
