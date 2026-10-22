import { useGameResourceProvider } from '@renderer-shared/providers/game-resource'
import type { ReviewEvent, ReviewReport } from '@shared/pro/review'
import { useTranslation } from 'i18next-vue'
import type { Ref } from 'vue'

export function useEventDescription(report: Readonly<Ref<ReviewReport>>) {
  const resources = useGameResourceProvider()
  const { t } = useTranslation(undefined, { keyPrefix: 'pro.review' })
  function champion(id?: number) {
    const player = report.value.analysis.participants.find((p) => p.id === id)
    return player ? resources.champions.name(player.championId) : t('unknown')
  }
  function describe(event: ReviewEvent) {
    if (event.type === 'CHAMPION_KILL')
      return t('killEvent', { killer: champion(event.killerId), victim: champion(event.victimId) })
    if (event.type === 'ELITE_MONSTER_KILL')
      return `${champion(event.killerId)} · ${t(`objectives.${event.monsterType}`, { defaultValue: event.monsterType ?? t('unknown') })}${event.monsterSubType ? ` (${event.monsterSubType})` : ''}`
    if (event.type === 'BUILDING_KILL')
      return `${champion(event.killerId)} · ${t('building')} · ${event.laneType ?? ''} · ${event.buildingType ?? ''}`
    return `${champion(event.participantId)} · ${t(`events.${event.type}`, { defaultValue: event.type })} · ${resources.items.display(event.itemId ?? 0)?.name ?? event.itemId ?? ''}`
  }
  return { describe, champion }
}
