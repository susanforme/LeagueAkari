<template>
  <section class="hw-panel champion-hero">
    <LcuImage
      v-if="info?.skins.length"
      :src="(info.skins.find((s) => s.isBase) ?? info.skins[0]).splashPath"
      class="hero-art"
      alt=""
    />
    <div class="hero-content hw-stack">
      <div class="hw-row">
        <ChampionIcon :champion-id="championId" class="hero-portrait" />
        <div>
          <h2>{{ resources.champions.name(championId) }}</h2>
          <p class="hw-muted">{{ info?.title }}</p>
          <div class="hw-row">
            <NTag v-for="role in info?.roles" :key="role" size="small">{{ role }}</NTag>
          </div>
        </div>
        <slot name="action" />
      </div>
      <p v-if="expanded && info" class="hero-bio" :title="plain(info.shortBio)">
        {{ plain(info.shortBio) }}
      </p>
      <div v-if="info" class="hw-row">
        <NTooltip v-for="(skill, i) in [info.passive, ...info.spells]" :key="i"
          ><template #trigger
            ><div class="hero-skill" tabindex="0">
              <LcuImage :src="skill.abilityIconPath" :alt="skill.name" /><small>{{
                ['P', 'Q', 'W', 'E', 'R'][i]
              }}</small>
            </div></template
          ><strong>{{ skill.name }}</strong>
          <p class="skill-description">{{ plain(skill.description) }}</p></NTooltip
        >
      </div>
      <span v-if="loading && !info" class="hw-muted">{{ t('loading') }}</span>
    </div>
  </section>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import { useQueryCache } from '../../../../shared/composables/query-cache'

import { ref, shallowRef, computed, watch, onScopeDispose } from 'vue'
import { NTag, NTooltip } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import LcuImage from '@renderer-shared/components/LcuImage.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { useInstance } from '@renderer-shared/shards'
import type { ChampionInfo } from '@shared/pro/notebook/handbook'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
const props = defineProps<{ championId: number; expanded?: boolean }>()
const emit = defineEmits<{ loaded: [info: ChampionInfo | null] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const resources = useGameResourceProvider(),
  api = useInstance(NotebookRenderer)
const info = shallowRef<ChampionInfo | null>(null),
  failed = ref(false),
  loading = ref(false)
const locale = computed(() => (resources.runtime.locale === 'zh-CN' ? 'zh-CN' : 'en'))
let generation = 0
const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
useQueryCache(
  () => JSON.stringify([props.championId, locale.value]),
  info,
  () => null
)
watch(info, (value) => emit('loaded', value), { flush: 'sync' })
async function load() {
  const current = ++generation
  failed.value = false
  loading.value = true
  try {
    const next = await api.championInfo(locale.value, props.championId)
    if (current === generation) {
      info.value = next
      emit('loaded', next)
    }
  } catch {
    if (current === generation) failed.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
api.onResourcesChanged(({ key, failed: error }) => {
  if (key !== `champion-info:${locale.value}:${props.championId}`) return
  if (error) failed.value = true
  else void load()
})
useRefreshFeedback(
  () => failed.value,
  () => t('loadFailed')
)
watch([() => props.championId, locale], load, { immediate: true })
onScopeDispose(() => generation++)
</script>
<style scoped>
.champion-hero {
  position: relative;
  overflow: hidden;
  min-height: 128px;
}
.hero-art {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
  object-fit: cover;
  object-position: center 28%;
  opacity: 0.45;
}
.champion-hero:after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--la-card-surface-95) 20%, transparent 100%);
}
.hero-content {
  position: relative;
  z-index: 1;
  max-width: 600px;
}
.hero-portrait {
  width: 72px;
  height: 72px;
  border-radius: 8px;
}
.hero-bio {
  max-width: 430px;
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero-skill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.hero-skill :deep(img),
.hero-skill :deep(.lcu-image-placeholder) {
  width: 32px;
  height: 32px;
  border-radius: 4px;
}
.skill-description {
  max-width: 350px;
  line-height: 1.5;
}
</style>
