<template>
  <div class="hw-stack">
    <div class="overview-grid">
      <section class="hw-panel hw-stack">
        <div class="hw-row hw-between">
          <h3>{{ t('championOverview') }}</h3>
          <NButton size="tiny" :disabled="loading" @click="edit">{{ t('edit') }}</NButton>
        </div>
        <p class="hw-text">{{ guide?.summary || t('overviewEmpty') }}</p>
        <div class="hw-grid">
          <div class="hw-stack">
            <h3>{{ t('strengths') }}</h3>
            <p class="hw-text hw-muted">{{ guide?.strengths || t('notRecorded') }}</p>
          </div>
          <div class="hw-stack">
            <h3>{{ t('weaknesses') }}</h3>
            <p class="hw-text hw-muted">{{ guide?.weaknesses || t('notRecorded') }}</p>
          </div>
        </div>
      </section>
      <section class="hw-panel hw-stack">
        <h3>{{ t('playstyle') }}</h3>
        <p class="hw-text">{{ guide?.playstyle || t('notRecorded') }}</p>
        <NTag v-if="guide?.position">{{ tn(`positions.${guide.position}`) }}</NTag>
      </section>
      <section class="hw-panel"><ChampionTraits :info="info" /></section>
    </div>
    <div class="overview-bottom">
      <section class="hw-panel hw-stack">
        <div class="hw-row hw-between">
          <h3>{{ t('recentEntries') }}</h3>
          <NButton text size="small" @click="emit('section', 'note')">{{ t('viewAll') }}</NButton>
        </div>
        <NButton
          v-for="entry in recent"
          :key="entry.id"
          text
          class="recent-entry"
          @click="emit('open', entry)"
          ><NTag size="small">{{ t(entry.content.kind) }}</NTag
          ><span>{{ entry.content.title }}</span></NButton
        ><NEmpty v-if="!recent.length" size="small" :description="t('noEntries')" />
      </section>
      <section class="hw-panel hw-stack">
        <div class="hw-row hw-between">
          <h3>{{ t('build') }}</h3>
          <NButton text size="small" @click="emit('section', 'build')">{{ t('viewAll') }}</NButton>
        </div>
        <template v-if="build"
          ><NButton text @click="emit('open', build)">{{ build.content.title }}</NButton
          ><LoadoutSummary :content="build.content" />
          <div v-for="group in build.content.groups.slice(0, 3)" :key="group.name" class="hw-stack">
            <small class="hw-muted">{{ group.name }}</small>
            <div class="hw-row">
              <ItemDisplay
                v-for="(item, i) in group.items"
                :key="i"
                :item-id="item.id"
                :size="30"
              />
            </div></div></template
        ><NEmpty v-else size="small" :description="t('noBuild')" />
      </section>
      <section class="hw-panel hw-stack">
        <h3>{{ t('practice') }}</h3>
        <NButton v-for="plan in plans" :key="plan.id" text @click="emit('section', 'practice')"
          ><span>{{ plan.content.title }}</span
          ><NTag size="small">{{ t(plan.content.state) }}</NTag></NButton
        ><NEmpty v-if="!plans.length" size="small" :description="t('noPractice')" /><NButton
          type="primary"
          secondary
          @click="emit('section', 'practice')"
          >{{ t('openPractice') }}</NButton
        >
      </section>
    </div>
    <NModal
      class="handbook-workspace"
      :show="!!draft"
      preset="card"
      :title="t('championOverview')"
      style="width: 660px; max-width: 95vw"
      :mask-closable="false"
      :closable="!saving"
      @update:show="!$event && (draft = null)"
      ><NForm v-if="draft" :disabled="saving" class="hw-stack"
        ><NFormItem :label="tn('position')"
          ><NSelect
            v-model:value="draft.position"
            clearable
            :options="
              positions.map((value) => ({ value, label: tn(`positions.${value}`) }))
            " /></NFormItem
        ><NFormItem
          v-for="key in ['summary', 'strengths', 'weaknesses', 'playstyle'] as const"
          :key="key"
          :label="t(key)"
          ><NInput
            v-model:value="draft[key]"
            type="textarea"
            :maxlength="10000"
            :autosize="{ minRows: 2, maxRows: 5 }" /></NFormItem
        ><NAlert v-if="saveError" type="error">{{ t('saveFailed') }}</NAlert
        ><NButton type="primary" :loading="saving" @click="save">{{ t('save') }}</NButton></NForm
      ></NModal
    >
  </div>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import { ref, shallowRef, watch, onScopeDispose } from 'vue'
import { NButton, NAlert, NEmpty, NTag, NModal, NInput, NSelect, NForm, NFormItem } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import { listSchema, type NotebookEntry } from '@shared/pro/notebook'
import {
  championGuideSchema,
  positions,
  type ChampionGuide,
  type ChampionGuideInput,
  type ChampionInfo,
  type PracticePlan
} from '@shared/pro/notebook/handbook'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
import ChampionTraits from './ChampionTraits.vue'
import LoadoutSummary from '../LoadoutSummary.vue'
const props = defineProps<{ championId: number; info: ChampionInfo | null; revision?: unknown }>(),
  emit = defineEmits<{ section: [section: string]; open: [entry: NotebookEntry] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' }),
  { t: tn } = useTranslation(undefined, { keyPrefix: 'pro.notebook' }),
  api = useInstance(NotebookRenderer)
const guide = shallowRef<ChampionGuide | null>(null),
  draft = ref<ChampionGuideInput | null>(null),
  recent = shallowRef<NotebookEntry[]>([]),
  build = shallowRef<NotebookEntry | null>(null),
  plans = shallowRef<PracticePlan[]>([]),
  loading = ref(true),
  failed = ref(false),
  saving = ref(false),
  saveError = ref(false)
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  failed.value = false
  try {
    const [g, r, b, p] = await Promise.all([
      api.guide(props.championId),
      api.list(listSchema.parse({ championId: props.championId, order: 'recent' })),
      api.list(listSchema.parse({ championId: props.championId, kind: 'build' })),
      api.practicePlans(props.championId)
    ])
    if (current !== generation) return
    guide.value = g
    recent.value = r.items.slice(0, 5)
    build.value = b.items[0] ?? null
    plans.value = p.items.slice(0, 4)
  } catch {
    if (current === generation) failed.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
function edit() {
  draft.value = championGuideSchema.parse({
    ...guide.value,
    championId: props.championId,
    expectedRevision: guide.value?.revision ?? 0
  })
  saveError.value = false
}
async function save() {
  if (!draft.value) return
  saving.value = true
  try {
    await api.saveGuide(championGuideSchema.parse(draft.value))
    draft.value = null
    await load()
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}
watch([() => props.championId, () => props.revision], load, { immediate: true })
onScopeDispose(() => generation++)
useRefreshFeedback(
  () => failed.value,
  () => t('loadFailed')
)
</script>
<style scoped>
.overview-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 14px;
}
.overview-bottom {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.recent-entry {
  height: auto;
  padding: 8px 0;
  text-align: left;
}
.recent-entry :deep(.n-button__content) {
  white-space: normal;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
}
@media (max-width: 1200px) {
  .overview-grid {
    grid-template-columns: 1.5fr 1fr;
  }
  .overview-grid > :last-child {
    grid-column: 1/-1;
  }
  .overview-bottom {
    grid-template-columns: 1fr 1fr;
  }
  .overview-bottom > :last-child {
    grid-column: 1/-1;
  }
}
@media (max-width: 850px) {
  .overview-grid,
  .overview-bottom {
    grid-template-columns: 1fr;
  }
}
</style>
