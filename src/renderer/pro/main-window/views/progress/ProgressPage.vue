<template>
  <div class="flex h-full min-w-0 flex-col">
    <div class="flex items-center gap-3 border-b border-(--la-color-popover-border) px-6 py-3">
      <NIcon :component="TargetArrow24Regular" size="22" /><span class="text-base font-bold">{{
        t('title')
      }}</span
      ><NRadioGroup v-model:value="tab" size="small"
        ><NRadioButton v-for="key in ['training', 'batch']" :key="key" :value="key">{{
          t(key)
        }}</NRadioButton></NRadioGroup
      >
    </div>
    <NScrollbar class="min-h-0 flex-1"
      ><div v-if="active" class="p-6">
        <TrainingPanel v-if="tab === 'training'" /><BatchPanel v-else /></div
    ></NScrollbar>
  </div>
</template>
<script setup lang="ts">
import { ref, onActivated, onDeactivated } from 'vue'
import { NIcon, NRadioGroup, NRadioButton, NScrollbar } from 'naive-ui'
import { TargetArrow24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import TrainingPanel from './TrainingPanel.vue'
import BatchPanel from './BatchPanel.vue'
import { z } from 'zod'
import { useWorkspaceState } from '../../../shared/composables/useWorkspaceState'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' }),
  tab = ref<'training' | 'batch'>('training'),
  active = ref(false)
onActivated(() => (active.value = true))
onDeactivated(() => (active.value = false))
useWorkspaceState('pro-progress', { tab }, z.object({ tab: z.enum(['training', 'batch']) }))
</script>
