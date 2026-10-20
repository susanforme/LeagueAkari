import {
  type MapId,
  getMapDomain,
  mapToImagePosition
} from '@renderer-shared/components/match-card/utils/game-map'
import type { ReviewAnalysis, ReviewEvent } from '@shared/pro/review'

export function eventTeam(event: ReviewEvent, participants: ReviewAnalysis['participants']) {
  const killer = participants.find((p) => p.id === event.killerId)
  if (killer) return killer.teamId
  if ([100, 200].includes(event.killerTeamId ?? 0)) return event.killerTeamId
  // Building teamId is the destroyed building's owner.
  if (event.type === 'BUILDING_KILL' && [100, 200].includes(event.teamId ?? 0))
    return event.teamId === 100 ? 200 : 100
  return null
}

export const eventKinds = ['all', 'deaths', 'kills', 'objectives', 'buildings'] as const
export type EventKind = (typeof eventKinds)[number]
export function eventKind(
  event: ReviewEvent,
  participantId: number
): Exclude<EventKind, 'all'> | null {
  if (event.type === 'CHAMPION_KILL') return event.victimId === participantId ? 'deaths' : 'kills'
  if (event.type === 'ELITE_MONSTER_KILL') return 'objectives'
  if (event.type === 'BUILDING_KILL') return 'buildings'
  return null
}
export function mapEvents(
  events: ReviewEvent[],
  mapId: number,
  participantId: number,
  kind: EventKind,
  from: number,
  to: number,
  team: number | null = null,
  participants: ReviewAnalysis['participants'] = []
) {
  if (![11, 12, 21].includes(mapId)) return { points: [], missing: 0 }
  const domain = getMapDomain(mapId as MapId)
  let missing = 0
  const points = events.flatMap((event) => {
    const category = eventKind(event, participantId)
    if (
      !category ||
      (kind !== 'all' && category !== kind) ||
      event.timestamp < from ||
      event.timestamp > to
    )
      return []
    if (team !== null && eventTeam(event, participants) !== team) return []
    const p = event.position
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < domain.minX ||
      p.x > domain.maxX ||
      p.y < domain.minY ||
      p.y > domain.maxY
    ) {
      missing++
      return []
    }
    return [{ event, category, ...mapToImagePosition(p.x, p.y, 100, 100, mapId as MapId) }]
  })
  return { points, missing }
}
