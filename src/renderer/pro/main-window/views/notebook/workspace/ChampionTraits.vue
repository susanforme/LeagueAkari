<template>
  <div class="hw-stack">
    <div class="hw-row hw-between">
      <h3>{{ t('officialTraits') }}</h3>
      <span class="hw-muted">{{ t('officialScale') }}</span>
    </div>
    <template v-if="info"
      ><div v-for="[key, value] in Object.entries(info.playstyleInfo)" :key="key" class="trait">
        <span>{{ t(key) }}</span
        ><NProgress
          type="line"
          :percentage="Math.min(100, (value / 3) * 100)"
          :show-indicator="false"
          :height="5"
        /><small>{{ value }} / 3</small>
      </div>
      <div class="trait">
        <span>{{ t('difficulty') }}</span
        ><NProgress
          type="line"
          :percentage="Math.min(100, (info.tacticalInfo.difficulty / 3) * 100)"
          :show-indicator="false"
          :height="5"
        /><small>{{ info.tacticalInfo.difficulty }} / 3</small>
      </div></template
    ><NEmpty v-else :description="t('unavailable')" size="small" />
  </div>
</template>
<script setup lang="ts">
import { NProgress, NEmpty } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import type { ChampionInfo } from '@shared/pro/notebook/handbook'
defineProps<{ info: ChampionInfo | null }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
</script>
<style scoped>
.trait {
  display: grid;
  grid-template-columns: 90px 1fr 40px;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.trait small {
  text-align: right;
  opacity: 0.6;
}
</style>
