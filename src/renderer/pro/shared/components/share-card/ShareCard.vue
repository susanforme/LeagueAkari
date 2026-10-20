<template>
  <NPopover trigger="click" placement="bottom-end">
    <template #trigger
      ><NButton size="tiny">{{ t('share') }}</NButton></template
    >
    <div class="flex flex-col gap-3">
      <NCheckbox v-if="identity" v-model:checked="showIdentity">{{ t('showIdentity') }}</NCheckbox>
      <div class="flex gap-2">
        <NButton size="small" :loading="busy" @click="share('copy')">{{ t('copyImage') }}</NButton>
        <NButton size="small" :disabled="busy" @click="share('save')">{{ t('saveImage') }}</NButton>
      </div>
      <span v-if="feedback">{{ t(feedback) }}</span>
    </div>
  </NPopover>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { NPopover, NButton, NCheckbox } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { ExperienceRenderer } from '../../shards/experience'
const props = defineProps<{ title: string; lines: string[]; identity?: string }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const api = useInstance(ExperienceRenderer)
const showIdentity = ref(false),
  busy = ref(false),
  feedback = ref('')
async function share(action: 'copy' | 'save') {
  if (busy.value) return
  busy.value = true
  feedback.value = ''
  try {
    await document.fonts.ready
    const lines = [
      ...(showIdentity.value && props.identity ? [props.identity] : []),
      ...props.lines
    ].slice(0, 24)
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 270 + lines.length * 62
    const context = canvas.getContext('2d')!
    const background = context.createLinearGradient(0, 0, 1200, canvas.height)
    background.addColorStop(0, '#12253a')
    background.addColorStop(1, '#162d31')
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#65ddc6'
    context.fillRect(56, 58, 6, 58)
    context.fillStyle = '#f3f7fc'
    context.font = 'bold 40px sans-serif'
    context.fillText(props.title, 86, 104, 1050)
    context.font = '28px sans-serif'
    lines.forEach((line, index) => {
      context.fillStyle = index % 2 ? '#b9cbd8' : '#edf5fa'
      context.fillText(line, 64, 180 + index * 62, 1072)
    })
    context.fillStyle = '#7d9ba5'
    context.font = '22px sans-serif'
    context.fillText(`League Akari · ${new Date().toLocaleDateString()}`, 64, canvas.height - 40)
    if (await api.share(canvas.toDataURL('image/png'), action)) feedback.value = 'shared'
  } catch {
    feedback.value = 'failed'
  } finally {
    busy.value = false
  }
}
</script>
