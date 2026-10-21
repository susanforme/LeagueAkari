<template>
  <NButton quaternary circle size="small" :aria-label="t('refresh')" :title="t('refresh')">
    <template #icon><NIcon :component="ArrowClockwise20Regular" /></template>
  </NButton>
</template>
<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { ArrowClockwise20Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile' })
</script>
