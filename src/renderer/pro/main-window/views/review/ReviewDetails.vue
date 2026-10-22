<template>
  <NCard size="small" class="review-details">
    <NCollapse
      ><NCollapseItem :title="tv('checkpoints')" name="checkpoints"
        ><NScrollbar x-scrollable>
          <NTable size="small" :single-line="false">
            <thead>
              <tr>
                <th>{{ t('checkpoint') }}</th>
                <th>{{ t('gold') }}</th>
                <th>{{ t('cs') }}</th>
                <th>{{ t('xp') }}</th>
                <th>{{ t('goldDiff') }}</th>
                <th>{{ t('csDiff') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="checkpoint in report.analysis.checkpoints" :key="checkpoint.target">
                <td>
                  <NButton
                    text
                    size="small"
                    :disabled="!checkpoint.point"
                    @click="checkpoint.point && $emit('locate', checkpoint.point.timestamp)"
                    >{{ formatGameTime(checkpoint.target) }}</NButton
                  >
                  <div class="text-xs opacity-60">
                    {{ checkpoint.point ? formatGameTime(checkpoint.point.timestamp) : '—' }}
                  </div>
                </td>
                <td v-for="key in keys" :key="key">{{ checkpoint.point?.[key] ?? '—' }}</td>
              </tr>
            </tbody>
          </NTable>
          <div class="mt-2 text-xs opacity-60">{{ t('checkpointHelp') }}</div>
        </NScrollbar></NCollapseItem
      ></NCollapse
    >
  </NCard>
</template>
<script setup lang="ts">
import { formatGameTime, type ReviewReport } from '@shared/pro/review'
import { useTranslation } from 'i18next-vue'
import { NButton, NCard, NTable, NCollapse, NCollapseItem, NScrollbar } from 'naive-ui'
defineProps<{ report: ReviewReport }>()
defineEmits<{ locate: [timestamp: number] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const { t: tv } = useTranslation(undefined, { keyPrefix: 'pro.visual' })
const keys = ['gold', 'cs', 'xp', 'goldDiff', 'csDiff'] as const
</script>
