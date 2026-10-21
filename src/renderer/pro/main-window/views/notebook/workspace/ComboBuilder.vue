<template>
  <div class="handbook-workspace">
    <div class="hw-row hw-between">
      <h3>{{ t('comboSequence') }}</h3>
      <NSelect
        v-model:value="content.difficulty"
        style="width: 140px"
        :options="difficulties.map((value) => ({ value, label: t(value) }))"
        :placeholder="t('difficulty')"
        :aria-label="t('difficulty')"
      />
    </div>
    <div class="combo-layout">
      <div class="hw-stack">
        <div
          v-for="(step, index) in content.steps"
          :key="index"
          class="hw-panel hw-stack"
          @dragover.prevent
          @drop.prevent="drop(index)"
        >
          <div class="hw-row">
            <span
              draggable="true"
              class="drag-handle"
              :title="t('dragStep')"
              @dragstart="drag = index"
              @dragend="drag = null"
              >⠿ {{ index + 1 }}</span
            ><NSelect
              :value="step.action === 'skill' ? `skill:${step.entityId}` : step.action"
              style="flex: 1"
              :options="options"
              :aria-label="t('skill')"
              @update:value="choose(index, $event)"
            /><NButton
              size="tiny"
              :disabled="index === 0"
              :aria-label="t('moveUp')"
              @click="move(index, -1)"
              >↑</NButton
            ><NButton
              size="tiny"
              :disabled="index === content.steps.length - 1"
              :aria-label="t('moveDown')"
              @click="move(index, 1)"
              >↓</NButton
            ><NButton size="tiny" @click="content.steps.splice(index, 1)">{{
              t('remove')
            }}</NButton>
          </div>
          <EntitySelect
            v-if="step.action === 'item' || step.action === 'spell'"
            v-model:value="step.entityId"
            :options="step.action === 'item' ? catalog.items : catalog.spells"
            :placeholder="tn(step.action)"
          />
          <div class="hw-row">
            <SkillIcon
              v-if="step.action === 'skill' && step.entityId"
              :slot="step.entityId"
              :skills="skills"
            /><NInput
              v-model:value="step.label"
              style="flex: 1"
              :maxlength="120"
              :placeholder="t('actionTitle')"
              :aria-label="t('actionTitle')"
            />
          </div>
          <NInput
            v-model:value="step.notes"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            :maxlength="2000"
            :placeholder="t('conditions')"
            :aria-label="t('conditions')"
          />
        </div>
        <NButton
          dashed
          :disabled="content.steps.length >= 100"
          @click="content.steps.push({ action: 'skill', entityId: 1, label: '', notes: '' })"
          >＋ {{ t('addStep') }}</NButton
        ><NUpload
          :show-file-list="false"
          accept="image/png,image/jpeg,image/webp"
          :disabled="(content.attachments?.length ?? 0) >= 2"
          :custom-request="attach"
          ><NButton size="small">{{ t('optionalScreenshot') }}</NButton></NUpload
        ><span class="hw-muted">{{ t('attachmentLimit') }}</span
        ><NAlert v-if="attachmentError" type="error">{{ t('attachmentError') }}</NAlert>
        <div v-for="(src, index) in content.attachments" :key="index" class="hw-row">
          <img :src="src" class="attachment" :alt="t('screenshot')" /><NButton
            size="tiny"
            @click="content.attachments?.splice(index, 1)"
            >{{ t('remove') }}</NButton
          >
        </div>
      </div>
      <aside class="hw-panel hw-stack">
        <h3>{{ t('livePreview') }}</h3>
        <div v-for="(step, index) in content.steps" :key="index" class="preview-step">
          <span class="number">{{ index + 1 }}</span>
          <div class="hw-stack">
            <SkillIcon
              v-if="step.action === 'skill' && step.entityId"
              :slot="step.entityId"
              :skills="skills"
            /><ItemDisplay
              v-else-if="step.action === 'item' && step.entityId"
              :item-id="step.entityId"
              :size="30"
            /><SummonerSpellDisplay
              v-else-if="step.action === 'spell' && step.entityId"
              :spell-id="step.entityId"
              :size="30"
            /><small v-else>{{ tn(`actions.${step.action}`) }}</small
            ><strong>{{ step.label }}</strong>
            <p class="hw-text hw-muted">{{ step.notes }}</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NButton,
  NInput,
  NSelect,
  NUpload,
  NAlert,
  type UploadCustomRequestOptions
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import type { NotebookContent, NotebookCatalog, NotebookSkills } from '@shared/pro/notebook'
import { actions } from '@shared/pro/notebook'
import { difficulties } from '@shared/pro/notebook/handbook'
import SkillIcon from '../SkillIcon.vue'
import EntitySelect from '../EntitySelect.vue'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import SummonerSpellDisplay from '@renderer-shared/components/widgets/SummonerSpellDisplay.vue'
import './workspace.css'
const props = defineProps<{
  content: NotebookContent
  catalog: NotebookCatalog
  skills: NotebookSkills
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' }),
  { t: tn } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const drag = ref<number | null>(null),
  attachmentError = ref(false)
const options = computed(() => [
  ...['Q', 'W', 'E', 'R'].map((label, i) => ({ label, value: `skill:${i + 1}` })),
  ...actions.filter((a) => a !== 'skill').map((value) => ({ value, label: tn(`actions.${value}`) }))
])
function choose(index: number, value: string) {
  const step = props.content.steps[index]
  step.action = value.startsWith('skill:') ? 'skill' : (value as typeof step.action)
  step.entityId = step.action === 'skill' ? Number(value.split(':')[1]) : null
}
function drop(index: number) {
  if (drag.value === null) return
  const [step] = props.content.steps.splice(drag.value, 1)
  props.content.steps.splice(index, 0, step)
  drag.value = null
}
function move(index: number, direction: number) {
  drag.value = index
  drop(index + direction)
}
async function attach({ file, onFinish, onError }: UploadCustomRequestOptions) {
  attachmentError.value = false
  const content = props.content,
    blob = file.file
  if (
    !blob ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
    blob.size > 2 * 1024 * 1024 ||
    (content.attachments?.length ?? 0) >= 2
  ) {
    attachmentError.value = true
    onError()
    return
  }
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    content.attachments ??= []
    if (content.attachments.length < 2) content.attachments.push(url)
    onFinish()
  } catch {
    attachmentError.value = true
    onError()
  }
}
</script>
<style scoped>
.combo-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(200px, 1fr);
  gap: 16px;
  align-items: start;
}
.preview-step {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--hw-border);
}
.number {
  color: #15a880;
  flex-shrink: 0;
}
.attachment {
  width: 160px;
  max-height: 100px;
  object-fit: contain;
}
.drag-handle {
  cursor: grab;
  user-select: none;
}
@media (max-width: 700px) {
  .combo-layout {
    grid-template-columns: 1fr;
  }
}
</style>
