<template>
  <div class="flex flex-wrap gap-3 py-2">
    <div
      v-for="reason in reminder.reasons"
      :key="reason"
      class="flex min-w-16 flex-1 flex-col items-center gap-1 rounded-lg bg-(--la-card-muted-surface) p-2"
    >
      <NIcon :component="icons[reason]" :size="20" aria-hidden="true" />
      <span class="text-2xl font-semibold tabular-nums">{{ reminder[reason] }}</span>
      <span class="text-xs opacity-70">{{ t(reason) }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { Flag, Clock, X } from '@vicons/tabler'
import { useTranslation } from 'i18next-vue'
import type { PlayReminder } from '@shared/pro/experience'
defineProps<{ reminder: PlayReminder }>()
const icons = { games: Flag, minutes: Clock, losses: X }
const { t } = useTranslation(undefined, { keyPrefix: 'pro.visual' })
</script>
