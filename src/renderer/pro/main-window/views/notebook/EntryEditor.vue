<template>
  <div class="flex flex-col gap-4">
    <NInput
      v-model:value="content.title"
      :maxlength="120"
      :placeholder="t('entryTitle')"
      :aria-label="t('entryTitle')"
    />
    <div class="flex flex-wrap gap-3">
      <EntitySelect
        v-if="content.kind === 'matchup'"
        v-model:value="content.opponentId"
        class="min-w-48 flex-1"
        :options="champions"
        kind="champion"
        :placeholder="t('opponent')"
      />
      <NSelect
        v-model:value="content.position"
        class="min-w-40 flex-1"
        clearable
        :options="positionOptions"
        :placeholder="t('position')"
        :aria-label="t('position')"
      />
      <NCheckbox v-model:checked="content.pinned">{{ t('pinned') }}</NCheckbox>
    </div>
    <template v-if="content.kind === 'matchup'">
      <span class="font-medium">{{ briefT('title') }}</span>
      <NSelect
        v-model:value="content.matchupRating"
        clearable
        :options="['favorable', 'even', 'difficult'].map((value) => ({ value, label: hw(value) }))"
        :placeholder="hw('personalRating')"
        :aria-label="hw('personalRating')"
      />
      <div v-for="(s, i) in content.situations" :key="i" class="flex flex-col gap-2">
        <NInput
          v-model:value="s.title"
          :maxlength="120"
          :placeholder="hw('situation')"
          :aria-label="hw('situation')"
        />
        <NInput
          v-model:value="s.response"
          type="textarea"
          :maxlength="2000"
          :placeholder="hw('response')"
          :aria-label="hw('response')"
        />
        <NButton size="tiny" @click="content.situations?.splice(i, 1)">{{ t('remove') }}</NButton>
      </div>
      <NButton
        dashed
        :disabled="(content.situations?.length ?? 0) >= 20"
        @click="(content.situations ??= []).push({ title: '', response: '' })"
        >＋ {{ hw('situation') }}</NButton
      >
      <NInput
        v-for="field in ['opening', 'trading', 'caution'] as const"
        :key="field"
        :value="content.matchupPlan?.[field] ?? ''"
        :maxlength="300"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 3 }"
        :placeholder="briefT(field)"
        :input-props="{ 'aria-label': briefT(field) }"
        @update:value="
          (value) => {
            content.matchupPlan ??= { opening: '', trading: '', caution: '' }
            content.matchupPlan[field] = value
          }
        "
      />
    </template>
    <ComboBuilder
      v-if="content.kind === 'combo'"
      :content="content"
      :catalog="catalog"
      :skills="skills"
    />
    <template v-if="content.kind === 'build'">
      <LoadoutEditor :content="content" :catalog="catalog" />
      <NAlert v-if="content.source" type="info">{{ t('importExplanation') }}</NAlert>
      <div
        v-for="(group, index) in content.groups"
        :key="index"
        class="flex flex-col gap-2 rounded border border-(--la-color-popover-border) p-3"
      >
        <div class="flex items-center gap-2">
          <NInput
            v-model:value="group.name"
            :maxlength="80"
            :placeholder="t('groupName')"
            :aria-label="t('groupName')"
          />
          <NButton
            size="tiny"
            :disabled="index === 0"
            :aria-label="t('moveUp')"
            @click="move(content.groups, index, -1)"
            >↑</NButton
          >
          <NButton
            size="tiny"
            :disabled="index === content.groups.length - 1"
            :aria-label="t('moveDown')"
            @click="move(content.groups, index, 1)"
            >↓</NButton
          >
          <NButton size="tiny" @click="content.groups.splice(index, 1)">{{ t('remove') }}</NButton>
        </div>
        <div v-for="(item, i) in group.items" :key="i" class="flex items-center gap-2">
          <ItemDisplay :item-id="item.id" :size="28" />
          <span class="flex-1">{{ resources.items.display(item.id)?.name ?? item.id }}</span>
          <NInputNumber
            v-model:value="item.count"
            class="w-24!"
            :min="1"
            :max="99"
            :aria-label="t('quantity')"
          />
          <NButton
            size="tiny"
            :disabled="i === 0"
            :aria-label="t('moveUp')"
            @click="move(group.items, i, -1)"
            >↑</NButton
          >
          <NButton
            size="tiny"
            :disabled="i === group.items.length - 1"
            :aria-label="t('moveDown')"
            @click="move(group.items, i, 1)"
            >↓</NButton
          >
          <NButton size="tiny" @click="group.items.splice(i, 1)">{{ t('remove') }}</NButton>
        </div>
        <EntitySelect
          :value="null"
          :options="catalog.items"
          :placeholder="t('addItem')"
          :disabled="group.items.length >= 32"
          @update:value="
            (id) => {
              if (id) group.items.push({ id, count: 1 })
            }
          "
        />
      </div>
      <NButton
        dashed
        :disabled="content.groups.length >= 20"
        @click="content.groups.push({ name: t('groupDefault'), items: [] })"
        >{{ t('addGroup') }}</NButton
      >
      <span class="font-medium">{{ t('skillOrder') }}</span>
      <SkillOrder v-model="content.skillOrder" :skills="skills" editable />
    </template>
    <EntryMetadata :content="content" :entry-id="entryId" />
    <div class="flex items-center justify-between gap-2">
      <span>{{ t('body') }}</span>
      <NButton
        size="tiny"
        :disabled="!!content.text.trim()"
        @click="content.text = t(`templates.${content.kind}`)"
        >{{ t('useTemplate') }}</NButton
      >
    </div>
    <NInput
      v-model:value="content.text"
      type="textarea"
      :autosize="{ minRows: 5, maxRows: 14 }"
      :maxlength="30000"
      :placeholder="t('body')"
      :aria-label="t('body')"
    />
  </div>
</template>
<script setup lang="ts">
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import {
  type NotebookCatalog,
  type NotebookContent,
  type NotebookSkills
} from '@shared/pro/notebook'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NCheckbox, NInput, NInputNumber, NSelect } from 'naive-ui'
import { computed } from 'vue'
import EntitySelect from './EntitySelect.vue'
import ComboBuilder from './workspace/ComboBuilder.vue'
import SkillOrder from './workspace/SkillOrder.vue'
import EntryMetadata from './EntryMetadata.vue'
import LoadoutEditor from './LoadoutEditor.vue'
defineProps<{
  entryId?: string | null
  content: NotebookContent
  catalog: NotebookCatalog
  skills: NotebookSkills
  champions: { id: number; name: string }[]
}>()
const resources = useGameResourceProvider()
const { t: hw } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' })
const { t } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: briefT } = useTranslation(undefined, { keyPrefix: 'pro.matchupBrief' })
const positionOptions = computed(() =>
  ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map((value) => ({
    value,
    label: t(`positions.${value}`)
  }))
)
function move<T>(list: T[], index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
}
</script>
