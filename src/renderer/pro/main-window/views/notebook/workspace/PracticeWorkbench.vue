<template>
  <div class="handbook-workspace">
    <div class="hw-row hw-between">
      <h2>{{ t('practice') }}</h2>
      <div class="hw-row">
        <EntitySelect
          v-if="!championId"
          v-model:value="filterChampion"
          :options="champions"
          kind="champion"
          :placeholder="t('allChampions')"
          style="width: 220px"
        /><NButton type="primary" @click="create">＋ {{ t('newPractice') }}</NButton>
      </div>
    </div>

    <div class="practice-layout">
      <aside class="hw-panel hw-stack">
        <h3>{{ t('practicePlans') }}</h3>
        <NInput
          v-model:value="search"
          clearable
          size="small"
          :placeholder="t('searchPlans')"
          :aria-label="t('searchPlans')"
        /><NButton
          v-for="plan in plans"
          :key="plan.id"
          class="hw-entry"
          :class="{ 'hw-selected': selected?.id === plan.id }"
          :bordered="false"
          @click="select(plan)"
          ><ChampionIcon :champion-id="plan.content.championId" class="hw-avatar" />
          <div class="plan-label">
            <strong>{{ plan.content.title }}</strong>
            <div class="hw-muted">
              {{ plan.content.category }} · {{ t(plan.content.difficulty) }} ·
              {{ t(plan.content.state) }} · {{ percent(plan.completion) }}
            </div>
          </div></NButton
        ><NEmpty v-if="!plans.length && !loading" :description="t('noPractice')" /><NPagination
          v-if="total > 30"
          v-model:page="page"
          :item-count="total"
          :page-size="30"
          simple
        />
      </aside>
      <template v-if="selected"
        ><main class="hw-stack">
          <section class="hw-panel hw-stack">
            <div class="hw-row hw-between">
              <h3>{{ selected.content.title }}</h3>
              <div class="hw-row">
                <NButton size="small" @click="edit">{{ t('edit') }}</NButton
                ><NButton
                  type="primary"
                  size="small"
                  :loading="busy"
                  @click="
                    changeState(selected?.content.state === 'practicing' ? 'paused' : 'practicing')
                  "
                  >{{
                    t(selected.content.state === 'practicing' ? 'pause' : 'startPractice')
                  }}</NButton
                ><NButton size="small" @click="openSession">{{ t('recordSession') }}</NButton>
              </div>
            </div>
            <p class="hw-text">{{ selected.content.description }}</p>
            <div class="hw-row">
              <NTag>{{ t(selected.content.state) }}</NTag
              ><NTag>{{ t(selected.content.difficulty) }}</NTag
              ><NButton
                v-if="selected.content.sourceEntryId"
                text
                size="small"
                @click="openSource"
                >{{ t('sourceEntry') }}</NButton
              ><NButton
                text
                size="small"
                :disabled="busy"
                @click="changeState(selected.content.state === 'mastered' ? 'pending' : 'mastered')"
                >{{ t(selected.content.state === 'mastered' ? 'reopen' : 'mastered') }}</NButton
              >
            </div>
          </section>
          <section class="hw-panel hw-stack">
            <div class="hw-row hw-between">
              <h3>{{ t('trainingGoals') }}</h3>
              <span class="hw-muted">{{ t('latestRecorded') }}</span>
            </div>
            <div v-for="goal in selected.content.goals" :key="goal.id" class="hw-stack goal">
              <div class="hw-row hw-between">
                <span>{{ goal.label }}</span
                ><small
                  >{{ latest(goal.id)?.value ?? '—' }} / {{ goal.target
                  }}{{ goal.unit === 'percent' ? '%' : '' }}</small
                >
              </div>
              <NProgress
                v-if="latest(goal.id)"
                type="line"
                :percentage="Math.min(100, (latest(goal.id)!.value / goal.target) * 100)"
                :show-indicator="false"
                :height="5"
              />
            </div>
            <NEmpty
              v-if="!selected.content.goals.length"
              size="small"
              :description="t('noGoals')"
            />
          </section>
          <section class="hw-panel hw-stack">
            <div class="hw-row hw-between">
              <h3>{{ t('trainingSteps') }}</h3>
              <NButton size="tiny" @click="edit">{{ t('edit') }}</NButton>
            </div>
            <div v-for="(step, index) in selected.content.steps" :key="index" class="training-step">
              <span class="step-number">{{ index + 1 }}</span>
              <div>
                <strong>{{ step.title }}</strong>
                <p class="hw-text hw-muted">{{ step.notes }}</p>
              </div>
            </div>
            <NEmpty
              v-if="!selected.content.steps.length"
              size="small"
              :description="t('noSteps')"
            />
          </section>
          <section class="hw-panel hw-stack">
            <h3>{{ t('notes') }}</h3>
            <p class="hw-text">{{ selected.content.notes || t('notRecorded') }}</p>
          </section>
        </main>
        <aside class="hw-stack">
          <section class="hw-panel hw-stack">
            <div class="hw-row hw-between">
              <h3>{{ t('practiceStats') }}</h3>
              <NSelect
                v-model:value="days"
                size="small"
                style="width: 115px"
                :options="
                  [7, 30, 90, 365].map((value) => ({ value, label: t('days', { count: value }) }))
                "
                :aria-label="t('period')"
              />
            </div>
            <div class="stats-grid">
              <div>
                <strong>{{ sessions?.stats.sessions ?? '—' }}</strong
                ><small>{{ t('sessions') }}</small>
              </div>
              <div>
                <strong>{{
                  sessions ? (sessions.stats.durationSeconds / 3600).toFixed(1) + ' h' : '—'
                }}</strong
                ><small>{{ t('practiceTime') }}</small>
              </div>
              <div>
                <strong>{{ percent(sessions?.stats.completion) }}</strong
                ><small>{{ t('averageCompletion') }}</small>
              </div>
              <div>
                <strong>{{ percent(sessions?.stats.hitRate) }}</strong
                ><small>{{ t('hitRate') }}</small>
              </div>
            </div>
            <p class="hw-muted">{{ t('manualMetrics') }}</p>
          </section>
          <section class="hw-panel hw-stack">
            <h3>{{ t('recentSessions') }}</h3>

            <div v-for="session in sessions?.items" :key="session.id" class="hw-stack hw-rule">
              <div class="hw-row hw-between">
                <strong>{{ new Date(session.practicedAt).toLocaleDateString() }}</strong
                ><small>{{ (session.durationSeconds / 60).toFixed(1) }} min</small>
              </div>
              <span
                >{{ t('completion') }} {{ percent(session.completion) }} · {{ t('hitRate') }}
                {{
                  session.attempts ? percent((session.hits! / session.attempts) * 100) : '—'
                }}</span
              >
              <p class="hw-text hw-muted">{{ session.notes }}</p>
              <NButton text size="tiny" @click="viewSession = session">{{ t('details') }}</NButton>
            </div>
            <NEmpty
              v-if="sessions && !sessions.total"
              size="small"
              :description="t('noSessions')"
            /><NPagination
              v-if="sessions && sessions.total > 20"
              v-model:page="sessionPage"
              :item-count="sessions.total"
              :page-size="20"
              simple
            />
          </section></aside></template
      ><NEmpty v-else :description="t('selectPlan')" />
    </div>
    <NModal
      class="handbook-workspace"
      :show="!!draft"
      preset="card"
      :title="t('practicePlan')"
      style="width: 760px; max-width: 95vw"
      :mask-closable="false"
      :closable="!busy"
      @update:show="!$event && (draft = null)"
      ><NScrollbar style="max-height: 70vh"
        ><NForm v-if="draft" :disabled="busy" class="hw-stack"
          ><NFormItem :label="t('champion')"
            ><EntitySelect
              v-if="!draft.id"
              v-model:value="draft.content.championId"
              :options="champions"
              kind="champion"
              :placeholder="t('champion')"
            /><span v-else>{{
              resources.champions.name(draft.content.championId)
            }}</span></NFormItem
          ><NFormItem :label="t('title')"
            ><NInput v-model:value="draft.content.title" :aria-label="t('title')" :maxlength="120"
          /></NFormItem>
          <div class="hw-grid">
            <NFormItem :label="t('category')"
              ><NInput v-model:value="draft.content.category" :maxlength="60" /></NFormItem
            ><NFormItem :label="t('difficulty')"
              ><NSelect
                v-model:value="draft.content.difficulty"
                :options="difficulties.map((value) => ({ value, label: t(value) }))"
            /></NFormItem>
          </div>
          <NFormItem :label="t('description')"
            ><NInput v-model:value="draft.content.description" type="textarea" :maxlength="10000"
          /></NFormItem>
          <h3>{{ t('trainingGoals') }}</h3>
          <div v-for="(goal, index) in draft.content.goals" :key="goal.id" class="hw-row">
            <NInput
              v-model:value="goal.label"
              style="flex: 1; min-width: 180px"
              :maxlength="200"
              :placeholder="t('goal')"
              :aria-label="t('goal')"
            /><NInputNumber
              v-model:value="goal.target"
              style="width: 110px"
              :min="1"
              :max="goal.unit === 'percent' ? 100 : 100000"
              :aria-label="t('target')"
            /><NSelect
              v-model:value="goal.unit"
              style="width: 100px"
              :options="[
                { value: 'count', label: t('count') },
                { value: 'percent', label: '%' }
              ]"
              :aria-label="t('unit')"
            /><NButton size="tiny" @click="draft.content.goals.splice(index, 1)">{{
              t('remove')
            }}</NButton>
          </div>
          <NButton
            dashed
            :disabled="draft.content.goals.length >= 30"
            @click="
              draft?.content.goals.push({
                id: crypto.randomUUID(),
                label: '',
                target: 80,
                unit: 'percent'
              })
            "
            >＋ {{ t('goal') }}</NButton
          >
          <h3>{{ t('trainingSteps') }}</h3>
          <div v-for="(step, index) in draft.content.steps" :key="index" class="hw-panel hw-stack">
            <div class="hw-row">
              <span>{{ index + 1 }}</span
              ><NInput
                v-model:value="step.title"
                style="flex: 1"
                :maxlength="120"
                :placeholder="t('title')"
                :aria-label="t('title')"
              /><NButton
                size="tiny"
                :disabled="index === 0"
                :aria-label="t('moveUp')"
                @click="move(draft.content.steps, index, -1)"
                >↑</NButton
              ><NButton
                size="tiny"
                :disabled="index === draft.content.steps.length - 1"
                :aria-label="t('moveDown')"
                @click="move(draft.content.steps, index, 1)"
                >↓</NButton
              ><NButton size="tiny" @click="draft.content.steps.splice(index, 1)">{{
                t('remove')
              }}</NButton>
            </div>
            <NInput
              v-model:value="step.notes"
              type="textarea"
              :maxlength="2000"
              :placeholder="t('instructions')"
              :aria-label="t('instructions')"
            />
          </div>
          <NButton
            dashed
            :disabled="draft.content.steps.length >= 100"
            @click="draft.content.steps.push({ title: '', notes: '' })"
            >＋ {{ t('addStep') }}</NButton
          ><NFormItem :label="t('notes')"
            ><NInput
              v-model:value="draft.content.notes"
              type="textarea"
              :maxlength="10000" /></NFormItem
          ><NAlert v-if="saveError" type="error">{{ t('saveFailed') }}</NAlert
          ><NButton type="primary" :loading="busy" @click="save">{{ t('save') }}</NButton></NForm
        ></NScrollbar
      ></NModal
    >
    <NModal
      class="handbook-workspace"
      :show="!!record"
      preset="card"
      :title="t('recordSession')"
      style="width: 620px; max-width: 95vw"
      :mask-closable="false"
      :closable="!busy"
      @update:show="!$event && (record = null)"
      ><NForm v-if="record" :disabled="busy" class="hw-stack"
        ><p class="hw-muted">{{ t('manualMetrics') }}</p>
        <NFormItem :label="t('date')"
          ><NDatePicker
            v-model:value="record.practicedAt"
            type="datetime"
            :is-date-disabled="(date) => date > Date.now()" /></NFormItem
        ><NFormItem :label="t('durationSeconds')"
          ><NInputNumber
            v-model:value="record.durationSeconds"
            :aria-label="t('durationSeconds')"
            :min="1"
            :max="86400"
        /></NFormItem>
        <div class="hw-grid">
          <NFormItem :label="t('attempts')"
            ><NInputNumber
              v-model:value="record.attempts"
              :aria-label="t('attempts')"
              :min="1"
              :max="100000" /></NFormItem
          ><NFormItem :label="t('hits')"
            ><NInputNumber
              v-model:value="record.hits"
              :aria-label="t('hits')"
              :min="0"
              :max="record.attempts ?? 100000"
          /></NFormItem>
        </div>
        <NFormItem
          v-for="goal in selected?.content.goals"
          :key="goal.id"
          :label="`${goal.label} (${goal.target}${goal.unit === 'percent' ? '%' : ''})`"
          ><NInputNumber
            :aria-label="goal.label"
            :value="record.results.find((r) => r.goalId === goal.id)?.value ?? null"
            :min="0"
            :max="goal.unit === 'percent' ? 100 : 100000"
            @update:value="setResult(goal.id, $event)" /></NFormItem
        ><NFormItem :label="t('sessionNotes')"
          ><NInput v-model:value="record.notes" type="textarea" :maxlength="10000" /></NFormItem
        ><NAlert v-if="saveError" type="error">{{ t('saveFailed') }}</NAlert
        ><NButton type="primary" :loading="busy" @click="saveSession">{{
          t('saveSession')
        }}</NButton></NForm
      ></NModal
    ><NModal
      class="handbook-workspace"
      :show="!!viewSession"
      preset="card"
      :title="t('sessionResults')"
      style="width: 540px; max-width: 95vw"
      @update:show="!$event && (viewSession = null)"
      ><div class="hw-stack">
        <p v-for="result in viewSession?.results" :key="result.goalId">
          {{ result.label }} · {{ result.value }} / {{ result.target
          }}{{ result.unit === 'percent' ? '%' : '' }}
        </p>
        <p class="hw-text">{{ viewSession?.notes }}</p>
      </div></NModal
    >
  </div>
</template>
<script setup lang="ts">
import { useRefreshFeedback } from '../../../../shared/composables/useRefreshFeedback'
import { useQueryCache } from '../../../../shared/composables/query-cache'

import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import {
  NButton,
  NInput,
  NSelect,
  NAlert,
  NEmpty,
  NTag,
  NProgress,
  NPagination,
  NModal,
  NForm,
  NFormItem,
  NInputNumber,
  NDatePicker,
  NScrollbar
} from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import {
  blankPractice,
  difficulties,
  savePracticePlanSchema,
  savePracticeSessionSchema,
  type PracticePlan,
  type SavePracticePlan,
  type SavePracticeSession,
  type PracticeSession,
  type PracticeSessionPage
} from '@shared/pro/notebook/handbook'
import type { NotebookEntry } from '@shared/pro/notebook'
import { NotebookRenderer } from '../../../../shared/shards/notebook'
import EntitySelect from '../EntitySelect.vue'
import './workspace.css'
const props = defineProps<{
    championId: number | null
    entryId?: string | null
    champions: { id: number; name: string; keywords?: string }[]
  }>(),
  emit = defineEmits<{ open: [entry: NotebookEntry] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' }),
  api = useInstance(NotebookRenderer),
  resources = useGameResourceProvider()
const crypto = globalThis.crypto,
  filterChampion = ref<number | null>(null),
  search = ref(''),
  page = ref(1),
  total = ref(0),
  plans = shallowRef<PracticePlan[]>([]),
  selected = shallowRef<PracticePlan | null>(null),
  sessions = shallowRef<PracticeSessionPage | null>(null),
  sessionPage = ref(1),
  days = ref(30),
  draft = ref<SavePracticePlan | null>(null),
  record = ref<SavePracticeSession | null>(null),
  viewSession = shallowRef<PracticeSession | null>(null),
  loading = ref(false),
  error = ref(false),
  sessionError = ref(false),
  busy = ref(false),
  saveError = ref(false)
const champion = computed(() => props.championId ?? filterChampion.value)
let generation = 0,
  sessionGeneration = 0
const timers = new Map<string, { startedAt: number | null; elapsed: number }>()
const percent = (value: number | null | undefined) => (value == null ? '—' : `${value.toFixed(1)}%`)
const latest = (id: string) => sessions.value?.items[0]?.results.find((r) => r.goalId === id)
function move<T>(list: T[], index: number, direction: number) {
  const next = index + direction
  if (next < 0 || next >= list.length) return
  ;[list[index], list[next]] = [list[next], list[index]]
}
useQueryCache(
  () => JSON.stringify([selected.value?.id, days.value, sessionPage.value]),
  sessions,
  () => null
)
useQueryCache(
  () => JSON.stringify([champion.value, search.value, page.value]),
  plans,
  () => []
)
async function load() {
  const current = ++generation
  loading.value = true
  error.value = false
  try {
    const data = await api.practicePlans(champion.value, page.value, search.value)
    if (current !== generation) return
    plans.value = data.items
    total.value = data.total
    if (!selected.value || !data.items.some((p) => p.id === selected.value?.id)) {
      select(data.items[0] ?? null)
    } else {
      selected.value = data.items.find((p) => p.id === selected.value?.id)!
    }
  } catch {
    if (current === generation) error.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}
function select(plan: PracticePlan | null) {
  selected.value = plan
  sessionPage.value = 1
  void loadSessions()
}
async function loadSessions() {
  const current = ++sessionGeneration
  if (!selected.value) return
  sessionError.value = false
  try {
    const next = await api.practiceSessions(selected.value.id, days.value, sessionPage.value)
    if (current === sessionGeneration) sessions.value = next
  } catch {
    if (current === sessionGeneration) sessionError.value = true
  }
}
function create() {
  draft.value = {
    id: null,
    expectedRevision: 0,
    content: blankPractice(champion.value ?? props.champions[0]?.id ?? 0)
  }
  saveError.value = false
}
function edit() {
  if (!selected.value) return
  draft.value = JSON.parse(
    JSON.stringify({
      id: selected.value.id,
      expectedRevision: selected.value.revision,
      content: selected.value.content
    })
  )
  saveError.value = false
}
async function save() {
  if (!draft.value || busy.value) return
  busy.value = true
  saveError.value = false
  try {
    const next = await api.savePracticePlan(savePracticePlanSchema.parse(draft.value))
    draft.value = null
    await load()
    select(next)
  } catch {
    saveError.value = true
  } finally {
    busy.value = false
  }
}
async function changeState(state: PracticePlan['content']['state']) {
  if (!selected.value || busy.value) return
  busy.value = true
  error.value = false
  try {
    const next = await api.savePracticePlan({
      id: selected.value.id,
      expectedRevision: selected.value.revision,
      content: { ...selected.value.content, state }
    })
    selected.value = next
    plans.value = plans.value.map((p) => (p.id === next.id ? next : p))
    const timer = timers.get(next.id) ?? { startedAt: null, elapsed: 0 }
    if (timer.startedAt) timer.elapsed += Date.now() - timer.startedAt
    timer.startedAt = state === 'practicing' ? Date.now() : null
    timers.set(next.id, timer)
  } catch {
    error.value = true
  } finally {
    busy.value = false
  }
}
function openSession() {
  if (!selected.value) return
  record.value = {
    id: crypto.randomUUID(),
    planId: selected.value.id,
    expectedRevision: selected.value.revision,
    practicedAt: Date.now(),
    durationSeconds: timers.has(selected.value.id)
      ? Math.max(
          1,
          Math.floor(
            (timers.get(selected.value.id)!.elapsed +
              (timers.get(selected.value.id)!.startedAt
                ? Date.now() - timers.get(selected.value.id)!.startedAt!
                : 0)) /
              1000
          )
        )
      : 900,
    attempts: null,
    hits: null,
    results: [],
    notes: ''
  }
  saveError.value = false
}
function setResult(goalId: string, value: number | null) {
  if (!record.value) return
  record.value.results = record.value.results.filter((r) => r.goalId !== goalId)
  if (value !== null) record.value.results.push({ goalId, value })
}
async function saveSession() {
  if (!record.value || busy.value) return
  busy.value = true
  saveError.value = false
  try {
    const saved = await api.recordPractice(savePracticeSessionSchema.parse(record.value))
    if (selected.value?.id === saved.planId)
      selected.value = { ...selected.value, completion: saved.completion }
    plans.value = plans.value.map((p) =>
      p.id === saved.planId ? { ...p, completion: saved.completion } : p
    )
    timers.delete(record.value.planId)
    record.value = null
    sessionPage.value = 1
    await loadSessions()
  } catch {
    saveError.value = true
  } finally {
    busy.value = false
  }
}
async function openSource() {
  if (!selected.value?.content.sourceEntryId) return
  try {
    emit('open', await api.get(selected.value.content.sourceEntryId))
  } catch {
    error.value = true
  }
}
watch([champion, search], () => {
  page.value = 1
  selected.value = null
  void load()
})
watch(page, load)
watch([days, sessionPage], loadSessions)
watch(
  () => props.entryId,
  async (id) => {
    await load()
    if (!id) return
    const current = ++generation
    try {
      const next = await api.practicePlan(id)
      if (current === generation) select(next)
    } catch {
      if (current === generation) error.value = true
    }
  },
  { immediate: true }
)
onScopeDispose(() => {
  generation++
  sessionGeneration++
})

useRefreshFeedback(
  () => error.value,
  () => t('loadFailed')
)
useRefreshFeedback(
  () => sessionError.value,
  () => t('loadFailed')
)
</script>
<style scoped>
.practice-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 270px;
  gap: 16px;
  align-items: start;
}
.plan-label {
  min-width: 0;
  overflow-wrap: anywhere;
}
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.stats-grid > div {
  padding: 12px;
  background: rgb(var(--la-card-tint-rgb) / 0.06);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.stats-grid strong {
  font-size: 20px;
}
.stats-grid small {
  font-size: 11px;
  opacity: 0.65;
}
.training-step {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--hw-border);
}
.step-number {
  background: rgba(50, 184, 145, 0.15);
  color: #1aaf85;
  border-radius: 50%;
  width: 25px;
  height: 25px;
  text-align: center;
  line-height: 25px;
  flex-shrink: 0;
}
.goal {
  padding: 8px 0;
}
@media (max-width: 1250px) {
  .practice-layout {
    grid-template-columns: 210px minmax(0, 1fr);
  }
  .practice-layout > aside:last-child {
    grid-column: 2;
  }
}
@media (max-width: 850px) {
  .practice-layout {
    grid-template-columns: 1fr;
  }
  .practice-layout > aside:last-child {
    grid-column: auto;
  }
}
</style>
