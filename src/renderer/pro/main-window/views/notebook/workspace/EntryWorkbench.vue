<template>
  <div class="handbook-workspace">
    <div class="hw-columns">
      <aside class="hw-panel hw-stack">
        <div class="hw-row hw-between">
          <h3>{{ t(kind === 'build' ? 'buildPresets' : 'myCombos') }}</h3>
          <NButton size="tiny" type="primary" @click="emit('create')">＋ {{ t('new') }}</NButton>
        </div>
        <slot name="filters" /><NButton
          v-for="entry in entries"
          :key="entry.id"
          class="hw-entry"
          :class="{ 'hw-selected': (editingId ?? selected?.id) === entry.id }"
          :bordered="false"
          @click="choose(entry)"
          ><div class="hw-stack">
            <strong>{{ entry.content.title }}</strong
            ><small class="hw-muted">{{ entry.content.tags?.join(' · ') }}</small>
          </div></NButton
        ><slot name="pagination" /><NEmpty
          v-if="!entries.length"
          :description="t('noEntries')"
          size="small"
        />
      </aside>
      <div v-if="$slots.editor" class="hw-stack"><slot name="editor" /></div>
      <main v-else-if="selected" class="hw-stack">
        <section class="hw-panel hw-stack">
          <div class="hw-row hw-between">
            <h3>{{ selected.content.title }}</h3>
            <div class="hw-row">
              <NButton size="small" @click="emit('edit', selected)">{{ t('edit') }}</NButton
              ><NButton size="small" @click="emit('open', selected)">{{ t('details') }}</NButton>
              <NDropdown
                trigger="click"
                :options="[
                  { key: 'pin', label: tn(selected.content.pinned ? 'unpin' : 'pin') },
                  { key: 'copy', label: tn('copy') },
                  { key: 'history', label: tn('history') },
                  { key: 'trash', label: tn('delete') }
                ]"
                @select="emit('manage', selected, $event)"
                ><NButton size="small" :aria-label="t('entryActions')">⋯</NButton></NDropdown
              >
            </div>
          </div>
          <p class="hw-text">{{ selected.content.text }}</p>
        </section>
        <template v-if="kind === 'build'">
          <div class="build-config">
            <section class="hw-panel hw-stack">
              <h3>{{ t('runesSpells') }}</h3>
              <LoadoutSummary :content="selected.content" detailed /><NEmpty
                v-if="!selected.content.runes && !selected.content.spells"
                size="small"
                :description="t('notRecorded')"
              />
            </section>
            <section class="hw-panel hw-stack">
              <h3>{{ t('skillOrder') }}</h3>
              <SkillOrder :model-value="selected.content.skillOrder" :skills="skills" />
            </section>
          </div>
          <div class="hw-grid">
            <section
              v-for="(group, i) in selected.content.groups"
              :key="i"
              class="hw-panel hw-stack"
            >
              <h3>{{ group.name }}</h3>
              <div class="hw-row">
                <template v-for="(item, index) in group.items" :key="index"
                  ><span v-if="index" class="hw-muted">→</span>
                  <div class="build-item">
                    <ItemDisplay :item-id="item.id" :size="40" /><small>{{
                      resources.items.display(item.id)?.name ?? item.id
                    }}</small
                    ><small v-if="item.count > 1">×{{ item.count }}</small>
                  </div></template
                >
              </div>
            </section>
          </div></template
        >
        <section v-else class="hw-panel">
          <EntryBody :content="{ ...selected.content, text: '' }" :skills="skills" />
        </section>
        <section class="hw-panel">
          <NotebookEntryTools
            :entry="selected"
            @open="emit('open', $event)"
            @changed="emit('changed')"
          />
        </section>
      </main>
      <NEmpty v-else :description="t('selectEntry')" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, useSlots } from 'vue'
import { NButton, NEmpty, NDropdown } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { NotebookEntry, NotebookSkills } from '@shared/pro/notebook'
import ItemDisplay from '@renderer-shared/components/widgets/ItemDisplay.vue'
import LoadoutSummary from '../LoadoutSummary.vue'
import NotebookEntryTools from '../NotebookEntryTools.vue'
import EntryBody from '../EntryBody.vue'
import SkillOrder from './SkillOrder.vue'
import './workspace.css'
const props = defineProps<{
    entries: NotebookEntry[]
    kind: 'build' | 'combo'
    skills: NotebookSkills
    editingId?: string | null
  }>(),
  emit = defineEmits<{
    create: []
    edit: [entry: NotebookEntry]
    open: [entry: NotebookEntry]
    changed: []
    manage: [entry: NotebookEntry, action: string]
  }>()
const { t: tn } = useTranslation(undefined, { keyPrefix: 'pro.notebook' })
const { t } = useTranslation(undefined, { keyPrefix: 'pro.handbookWorkspace' }),
  resources = useGameResourceProvider(),
  selectedId = ref('')
const slots = useSlots()
function choose(entry: NotebookEntry) {
  if (slots.editor) emit('edit', entry)
  else selectedId.value = entry.id
}
const selected = computed(
  () => props.entries.find((e) => e.id === selectedId.value) ?? props.entries[0]
)
</script>
<style scoped>
.build-config {
  display: grid;
  grid-template-columns: minmax(250px, 0.8fr) minmax(0, 1.4fr);
  gap: 14px;
}
@media (max-width: 1250px) {
  .build-config {
    grid-template-columns: 1fr;
  }
}
.build-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  max-width: 80px;
  text-align: center;
}
.build-item small {
  font-size: 11px;
}
</style>
