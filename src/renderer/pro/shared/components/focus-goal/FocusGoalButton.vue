<template>
  <NButton size="tiny" @click="open">{{ t('set') }}</NButton>
  <NModal
    v-model:show="show"
    preset="card"
    :title="t('title')"
    class="w-120! max-w-[95vw]!"
    :mask-closable="!saving"
    :closable="!saving"
  >
    <div class="flex flex-col gap-3">
      <span v-if="plan?.focus" class="text-sm">{{
        t('replacing', { text: plan.focus.text })
      }}</span>
      <NInput
        v-model:value="text"
        type="textarea"
        :maxlength="300"
        :input-props="{ 'aria-label': t('placeholder') }"
        :placeholder="t('placeholder')"
        :disabled="saving"
      />
      <NAlert v-if="error" type="error"
        >{{ t('failed') }}
        <NButton text :disabled="saving" @click="load">{{ t('reload') }}</NButton></NAlert
      >
      <NButton
        type="primary"
        :loading="saving || loading"
        :disabled="!plan || error || !text.trim()"
        @click="save"
        >{{ t('save') }}</NButton
      >
    </div>
  </NModal>
</template>
<script setup lang="ts">
import { ref, shallowRef, onScopeDispose } from 'vue'
import { NButton, NModal, NInput, NAlert, useMessage } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import type { ReviewReport } from '@shared/pro/review'
import type { PlayPlan } from '@shared/pro/experience/plan'
import { ExperienceRenderer } from '../../shards/experience'
const props = defineProps<{ report: ReviewReport; timestamp: number; suggestion?: string }>()
const api = useInstance(ExperienceRenderer),
  message = useMessage()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.focusGoal' })
const show = ref(false),
  text = ref(''),
  saving = ref(false),
  loading = ref(false),
  error = ref(false)
const plan = shallowRef<PlayPlan | null>(null)
let generation = 0,
  source: ReviewReport,
  timestamp = 0
function open() {
  source = props.report
  timestamp = props.timestamp
  text.value = props.suggestion ?? ''
  show.value = true
  void load()
}
async function load() {
  const current = ++generation
  plan.value = null
  error.value = false
  loading.value = true
  try {
    const result = await api.plan(source.player)
    if (current === generation) plan.value = result.plan
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
async function save() {
  if (!plan.value || saving.value || !source.analysis.metrics.championId) return
  saving.value = true
  error.value = false
  try {
    await api.changePlan({
      player: source.player,
      revision: plan.value.revision,
      action: {
        kind: 'focus',
        value: {
          reportId: source.id,
          timestamp,
          championId: source.analysis.metrics.championId,
          text: text.value
        }
      }
    })
    show.value = false
    message.success(t('saved'))
  } catch {
    error.value = true
  } finally {
    saving.value = false
  }
}
onScopeDispose(() => {
  generation++
})
</script>
