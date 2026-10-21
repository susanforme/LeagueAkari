<template>
  <NButton size="tiny" @click="show = true">{{ t('share') }}</NButton>
  <NModal v-model:show="show" preset="card" :title="t('share')" style="width: min(900px, 94vw)">
    <div class="flex flex-col gap-4">
      <NCheckbox v-if="identity" v-model:checked="showIdentity">{{ t('showIdentity') }}</NCheckbox>
      <NScrollbar style="max-height: 65vh">
        <img v-if="preview" :src="preview" :alt="title" class="block w-full rounded-lg" />
      </NScrollbar>
      <div class="flex justify-end gap-2">
        <NButton size="small" :disabled="busy || !preview" @click="share('copy')">{{
          t('copyImage')
        }}</NButton>
        <NButton size="small" :disabled="busy || !preview" @click="share('save')">{{
          t('saveImage')
        }}</NButton>
      </div>
      <span v-if="feedback" role="status">{{ t(feedback) }}</span>
    </div>
  </NModal>
</template>
<script setup lang="ts">
import type { ChampionStats } from '@shared/pro/champion-pool'
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import { ref, watch } from 'vue'
import { NModal, NScrollbar, NButton, NCheckbox } from 'naive-ui'
import { useTranslation } from 'i18next-vue'
import { useInstance } from '@renderer-shared/shards'
import { ExperienceRenderer } from '../../shards/experience'
const props = defineProps<{
  title: string
  lines: string[]
  identity?: string
  champions?: ChampionStats[]
}>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.experience' })
const api = useInstance(ExperienceRenderer)
const resources = useGameResourceProvider()
const { t: poolT } = useTranslation(undefined, { keyPrefix: 'pro.championPool' })
const show = ref(false),
  showIdentity = ref(false),
  busy = ref(false),
  feedback = ref(''),
  preview = ref('')
let generation = 0
async function render() {
  const current = ++generation
  if (!show.value) return
  await document.fonts.ready
  if (current !== generation) return
  const lines = props.lines.slice(0, 24)
  const champions = props.champions?.slice(0, 12) ?? []
  const heroTop = 230 + Math.ceil(lines.length / 2) * 104
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = heroTop + Math.ceil(champions.length / 2) * 150 + 110
  const ctx = canvas.getContext('2d')!
  const bg = ctx.createLinearGradient(0, 0, 1200, canvas.height)
  bg.addColorStop(0, '#101b38')
  bg.addColorStop(0.55, '#172f43')
  bg.addColorStop(1, '#102e30')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#69d8ce18'
  ctx.lineWidth = 1
  for (let x = -canvas.height; x < 1200; x += 90) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + canvas.height, canvas.height)
    ctx.stroke()
  }
  ctx.fillStyle = '#72edcb'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('LEAGUE AKARI / PRO', 60, 60)
  ctx.fillStyle = '#f3f7fc'
  ctx.font = 'bold 52px sans-serif'
  ctx.fillText(props.title, 60, 140, 1080)
  if (showIdentity.value && props.identity) {
    ctx.fillStyle = '#a4bace'
    ctx.font = '24px sans-serif'
    ctx.fillText(props.identity, 60, 190, 1080)
  }
  lines.forEach((line, index) => {
    const x = 60 + (index % 2) * 550,
      y = 230 + Math.floor(index / 2) * 104
    ctx.fillStyle = '#ffffff09'
    ctx.beginPath()
    ctx.roundRect(x, y, 530, 86, 12)
    ctx.fill()
    ctx.fillStyle = index < 2 ? '#72edcb' : '#829ab9'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(String(index + 1).padStart(2, '0'), x + 18, y + 32)
    ctx.fillStyle = '#edf5fa'
    ctx.font = '24px sans-serif'
    ctx.fillText(line, x + 18, y + 64, 494)
  })
  champions.forEach((champion, index) => {
    const x = 60 + (index % 2) * 550,
      y = heroTop + Math.floor(index / 2) * 150
    ctx.fillStyle = '#ffffff0c'
    ctx.beginPath()
    ctx.roundRect(x, y, 530, 132, 12)
    ctx.fill()
    ctx.fillStyle = '#213b50'
    ctx.fillRect(x + 18, y + 18, 80, 80)
    ctx.fillStyle = '#72edcb'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText(String(index + 1).padStart(2, '0'), x + 42, y + 66)
    ctx.fillStyle = '#f3f7fc'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(resources.champions.name(champion.championId ?? -1), x + 118, y + 44, 385)
    ctx.fillStyle = '#a9bed1'
    ctx.font = '20px sans-serif'
    ctx.fillText(
      `${champion.games} ${poolT('games')}  ·  ${champion.kda.value?.toFixed(2) ?? '—'} KDA`,
      x + 118,
      y + 78,
      385
    )
    ctx.fillStyle = '#ffffff15'
    ctx.fillRect(x + 118, y + 99, 280, 6)
    ctx.fillStyle = '#72edcb'
    ctx.fillRect(x + 118, y + 99, 280 * (champion.winRate.value ?? 0), 6)
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText(
      champion.winRate.value === null ? '—' : `${Math.round(champion.winRate.value * 100)}%`,
      x + 422,
      y + 110
    )
  })
  ctx.fillStyle = '#7d9ba5'
  ctx.font = '18px sans-serif'
  ctx.fillText(`League Akari · ${new Date().toLocaleDateString()}`, 60, canvas.height - 30)
  preview.value = canvas.toDataURL('image/png')
  await Promise.all(
    champions.map(async (champion, index) => {
      const icon = resources.champions.icon(champion.championId ?? -1)
      if (!icon) return
      const url = icon.source === 'url' ? icon.iconPath : resources.assets.resolve(icon.iconPath)
      if (!url) return
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) return
        const bitmap = await createImageBitmap(await response.blob())
        if (current === generation)
          ctx.drawImage(
            bitmap,
            78 + (index % 2) * 550,
            heroTop + Math.floor(index / 2) * 150 + 18,
            80,
            80
          )
        bitmap.close()
      } catch {
        /* Champion names and stats remain shareable when artwork is unavailable. */
      }
    })
  )
  if (current === generation) preview.value = canvas.toDataURL('image/png')
}
watch(
  [
    show,
    showIdentity,
    () => props.title,
    () => props.lines,
    () => props.identity,
    () => props.champions
  ],
  () => {
    feedback.value = ''
    preview.value = ''
    void render().catch(() => {
      feedback.value = 'failed'
    })
  }
)
async function share(action: 'copy' | 'save') {
  if (busy.value || !preview.value) return
  busy.value = true
  feedback.value = ''
  try {
    if (await api.share(preview.value, action)) feedback.value = 'shared'
  } catch {
    feedback.value = 'failed'
  } finally {
    busy.value = false
  }
}
</script>
