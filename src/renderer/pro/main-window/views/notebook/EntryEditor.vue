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
    <template v-if="content.kind === 'combo'">
      <div
        v-for="(step, index) in content.steps"
        :key="index"
        class="flex flex-wrap items-center gap-2 rounded border border-(--la-color-popover-border) p-2"
      >
        <span>{{ index + 1 }}</span>
        <NSelect
          :value="step.action"
          class="w-32!"
          :options="actionOptions"
          :aria-label="t('action')"
          @update:value="
            (value) => {
              step.action = value
              step.entityId = value === 'skill' ? 1 : null
            }
          "
        />
        <div v-if="step.action === 'skill'" class="flex gap-1">
          <NButton
            v-for="slot in [1, 2, 3, 4]"
            :key="slot"
            size="small"
            :type="step.entityId === slot ? 'primary' : 'default'"
            @click="step.entityId = slot"
            ><SkillIcon :slot="slot" :skills="skills"
          /></NButton>
        </div>
        <EntitySelect
          v-if="step.action === 'item' || step.action === 'spell'"
          v-model:value="step.entityId"
          class="min-w-44 flex-1"
          :options="step.action === 'item' ? catalog.items : catalog.spells"
          :placeholder="t(step.action)"
        />
        <NInput
          v-model:value="step.label"
          class="min-w-32 flex-1"
          :maxlength="120"
          :placeholder="t('stepLabel')"
          :aria-label="t('stepLabel')"
        />
        <NButton
          size="tiny"
          :disabled="index === 0"
          :aria-label="t('moveUp')"
          @click="move(content.steps, index, -1)"
          >↑</NButton
        >
        <NButton
          size="tiny"
          :disabled="index === content.steps.length - 1"
          :aria-label="t('moveDown')"
          @click="move(content.steps, index, 1)"
          >↓</NButton
        >
        <NButton size="tiny" @click="content.steps.splice(index, 1)">{{ t('remove') }}</NButton>
      </div>
      <NButton
        dashed
        :disabled="content.steps.length >= 100"
        @click="content.steps.push({ action: 'skill', entityId: 1, label: '' })"
        >{{ t('addStep') }}</NButton
      >
    </template>
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
      <div class="flex flex-wrap gap-1">
        <span
          v-for="(slot, index) in content.skillOrder"
          :key="index"
          class="flex flex-col items-center gap-1"
        >
          <span class="text-xs opacity-60">{{ index + 1 }}</span>
          <NButton
            size="small"
            :aria-label="t('removeLevel', { level: index + 1 })"
            @click="content.skillOrder.splice(index, 1)"
          >
            <SkillIcon :slot="slot" :skills="skills" />
          </NButton>
        </span>
      </div>
      <div class="flex gap-2">
        <NButton
          v-for="slot in [1, 2, 3, 4]"
          :key="slot"
          :disabled="content.skillOrder.length >= 30"
          @click="content.skillOrder.push(slot)"
        >
          <SkillIcon :slot="slot" :skills="skills" /><span class="ml-1">+</span>
        </NButton>
        <NButton :disabled="!content.skillOrder.length" @click="content.skillOrder.pop()">{{
          t('undo')
        }}</NButton>
      </div>
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
  actions,
  type NotebookCatalog,
  type NotebookContent,
  type NotebookSkills
} from '@shared/pro/notebook'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NCheckbox, NInput, NInputNumber, NSelect } from 'naive-ui'
import { computed } from 'vue'
import EntitySelect from './EntitySelect.vue'
import SkillIcon from './SkillIcon.vue'
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
const { t } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t: briefT } = useTranslation(undefined, { keyPrefix: 'pro.matchupBrief' })
const actionOptions = computed(() =>
  actions.map((value) => ({ value, label: t(`actions.${value}`) }))
)
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
