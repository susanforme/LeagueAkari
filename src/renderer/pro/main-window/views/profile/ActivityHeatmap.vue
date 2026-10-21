<template>
  <div
    class="activity-heatmap"
    :style="{ '--activity-color': theme.primaryColor, '--activity-empty': theme.dividerColor }"
  >
    <div class="mb-3 text-xs opacity-70">
      {{ formatDate(days[0].date) }} — {{ formatDate(days.at(-1)!.date) }}
    </div>
    <div class="flex flex-wrap items-center gap-8">
      <div>
        <div class="calendar" role="group" :aria-label="t('heatmap')">
          <span
            v-for="(label, index) in weekdays"
            :key="label"
            class="weekday"
            :style="{ gridColumn: 1, gridRow: index + 1 }"
            >{{ label }}</span
          >
          <NTooltip v-for="(day, index) in days" :key="day.date">
            <template #trigger>
              <NButton
                class="day-cell"
                :class="{ selected: selected.date === day.date }"
                :style="{
                  gridColumn: Math.floor((offset + index) / 7) + 2,
                  gridRow: ((offset + index) % 7) + 1,
                  backgroundColor: color(day.games)
                }"
                :aria-label="description(day)"
                :aria-pressed="selected.date === day.date"
                @click="selectDay(day.date)"
                @focus="selectedDate = day.date"
              />
            </template>
            {{ description(day) }}
          </NTooltip>
        </div>
        <div
          class="mt-3 flex items-center justify-end gap-1.5 text-xs opacity-70"
          :aria-label="t('legend')"
        >
          <span>{{ t('less') }}</span>
          <NTooltip v-for="count in [0, 1, 3, 6, 10]" :key="count">
            <template #trigger>
              <span class="size-3 rounded-xs" :style="{ backgroundColor: color(count) }" />
            </template>
            {{ t(`levels.${count}`) }}
          </NTooltip>
          <span>{{ t('more') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { ProfileActivity } from '@shared/pro/profile'
import { useTranslation } from 'i18next-vue'
import { NButton, NTooltip, useThemeVars } from 'naive-ui'
import { computed, ref } from 'vue'

const emit = defineEmits<{ select: [date: number] }>()
const props = defineProps<{ days: ProfileActivity['days'] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'pro.profile.activity' })
const theme = useThemeVars()
const resources = useGameResourceProvider()
const selectedDate = ref<number | null>(null)
function selectDay(date: number) {
  selectedDate.value = date
  emit('select', date)
}
const selected = computed(
  () => props.days.find((day) => day.date === selectedDate.value) ?? props.days.at(-1)!
)
const offset = computed(() => (new Date(props.days[0].date).getDay() + 6) % 7)
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, index) =>
    new Date(2026, 0, 5 + index).toLocaleDateString(resources.runtime.locale, { weekday: 'short' })
  )
)
const formatDate = (date: number) =>
  new Date(date).toLocaleDateString(resources.runtime.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
function color(games: number) {
  if (!games) return 'var(--activity-empty)'
  const strength = games < 3 ? 25 : games < 6 ? 45 : games < 10 ? 70 : 100
  return `color-mix(in srgb, var(--activity-color) ${strength}%, var(--activity-empty))`
}
function description(day: ProfileActivity['days'][number]) {
  return [
    formatDate(day.date),
    t('dailyGames', { count: day.games }),
    t('results', { wins: day.wins, losses: day.losses }),
    t('minutes', { value: day.durationSamples ? Math.round(day.durationSeconds / 60) : '—' })
  ].join(' · ')
}
</script>
<style scoped>
.calendar {
  display: grid;
  grid-template-columns: auto repeat(6, 15px);
  grid-template-rows: repeat(7, 15px);
  gap: 4px;
}
.weekday {
  align-self: center;
  padding-right: 8px;
  font-size: 10px;
  opacity: 0.6;
}
.day-cell {
  width: 15px;
  height: 15px;
  padding: 0;
  border-radius: 4px;
}
.day-cell.selected {
  outline: 2px solid var(--activity-color);
  outline-offset: 1px;
}
</style>
