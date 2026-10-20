<template>
  <div class="flex flex-col gap-3">
    <div v-if="content.opponentId || content.position" class="flex items-center gap-2">
      <template v-if="content.opponentId">
        <span>{{ t('against') }}</span>
        <ChampionIcon :champion-id="content.opponentId" class="size-7! rounded" />
        <span>{{ resources.champions.name(content.opponentId) }}</span>
      </template>
      <NTag v-if="content.position" size="small">{{ t(`positions.${content.position}`) }}</NTag>
    </div>
    <div v-if="content.steps.length" class="flex flex-wrap items-center gap-2">
      <template v-for="(step, index) in content.steps" :key="index">
        <span v-if="index" class="opacity-50">→</span>
        <NTag size="large">
          <span class="inline-flex items-center gap-1">
            <SkillIcon
              v-if="step.action === 'skill' && step.entityId"
              :slot="step.entityId"
              :skills="skills"
            />
            <ItemDisplay
              v-else-if="step.action === 'item' && step.entityId"
              :item-id="step.entityId"
              :size="28"
            />
            <SummonerSpellDisplay
              v-else-if="step.action === 'spell' && step.entityId"
              :spell-id="step.entityId"
              :size="28"
            />
            <span v-else>{{ t(`actions.${step.action}`) }}</span>
            <span>{{ step.label }}</span>
          </span>
        </NTag>
      </template>
    </div>
    <div v-for="(group, index) in content.groups" :key="index" class="flex flex-col gap-2">
      <span class="font-medium">{{ group.name }}</span>
      <div class="flex flex-wrap gap-3">
        <span
          v-for="(item, i) in group.items"
          :key="i"
          class="inline-flex items-center gap-1"
          :title="resources.items.display(item.id)?.name ?? String(item.id)"
        >
          <ItemDisplay :item-id="item.id" :size="32" />
          <span>{{ resources.items.display(item.id)?.name ?? item.id }}</span>
          <span v-if="item.count > 1">×{{ item.count }}</span>
        </span>
      </div>
    </div>
    <div v-if="content.skillOrder.length" class="flex flex-wrap gap-2">
      <span
        v-for="(slot, index) in content.skillOrder"
        :key="index"
        class="flex flex-col items-center gap-1"
      >
        <span class="text-xs opacity-60">{{ index + 1 }}</span>
        <SkillIcon :slot="slot" :skills="skills" />
      </span>
    </div>
    <div v-if="content.text" class="break-words whitespace-pre-wrap">{{ content.text }}</div>
    <span v-if="content.source" class="text-xs opacity-60">{{
      t('matchSource', { id: content.source.gameId })
    }}</span>
    <NButton
      v-if="content.source?.reportId"
      text
      size="small"
      @click="
        router.push({
          name: REVIEW_ROUTE,
          query: { id: content.source?.reportId, time: content.source?.timestamp ?? 0 }
        })
      "
    >
      {{ reviewT('locateNote', { time: formatGameTime(content.source.timestamp ?? 0) }) }}
    </NButton>
  </div>
</template>
<script setup lang="ts">
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import SummonerSpellDisplay from '@renderer-shared/components/widgets/SummonerSpellDisplay.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { NotebookContent, NotebookSkills } from '@shared/pro/notebook'
import { REVIEW_ROUTE, formatGameTime } from '@shared/pro/review'
import { useTranslation } from 'i18next-vue'
import { NButton, NTag } from 'naive-ui'
import { useRouter } from 'vue-router'
import SkillIcon from './SkillIcon.vue'
defineProps<{ content: NotebookContent; skills: NotebookSkills }>()
const resources = useGameResourceProvider()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: reviewT } = useTranslation(undefined, { keyPrefix: 'pro.review' })
const router = useRouter()
</script>
