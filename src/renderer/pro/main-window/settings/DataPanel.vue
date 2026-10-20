<template>
  <div class="flex flex-col gap-3">
    <div class="flex gap-3">
      <NButton :loading="busy" @click="backup">{{ t('backup') }}</NButton
      ><NButton :disabled="busy" @click="prepare">{{ t('restore') }}</NButton>
    </div>
    <NAlert
      v-if="state"
      :type="state === 'failed' || state === 'restoreFailed' ? 'error' : 'success'"
      >{{ t(state) }}</NAlert
    >
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NButton, NAlert, useDialog } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { ProgressRenderer } from '../../shared/shards/progress'
const api = useInstance(ProgressRenderer),
  dialog = useDialog(),
  { t } = useTranslation(undefined, { keyPrefix: 'pro.workshop' }),
  busy = ref(false),
  state = ref('')
onMounted(async () => {
  try {
    state.value = (await api.restoreStatus()) ?? ''
  } catch {
    state.value = 'failed'
  }
})
async function backup() {
  if (busy.value) return
  busy.value = true
  state.value = ''
  try {
    if (await api.backup()) state.value = 'backupSaved'
  } catch {
    state.value = 'failed'
  } finally {
    busy.value = false
  }
}
async function prepare() {
  if (busy.value) return
  busy.value = true
  state.value = ''
  try {
    const preview = await api.prepareRestore()
    if (!preview) return
    dialog.warning({
      title: t('restore'),
      content: t('restoreQuestion', { entries: preview.entries, matches: preview.matches }),
      positiveText: t('confirmRestore'),
      negativeText: t('cancel'),
      onPositiveClick: async () => {
        busy.value = true
        try {
          await api.restore(preview.token)
          state.value = 'restartRestore'
        } catch {
          state.value = 'failed'
        } finally {
          busy.value = false
        }
      }
    })
  } catch {
    state.value = 'failed'
  } finally {
    busy.value = false
  }
}
</script>
