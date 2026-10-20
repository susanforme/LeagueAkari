import type { ReviewEvent } from '@shared/pro/review'
import { expect, it } from 'vitest'

import { mapEvents } from './points'

const events: ReviewEvent[] = [
  {
    id: 'death',
    timestamp: 100,
    type: 'CHAMPION_KILL',
    victimId: 1,
    killerId: 6,
    position: { x: 0, y: 14881 }
  },
  {
    id: 'kill',
    timestamp: 200,
    type: 'CHAMPION_KILL',
    victimId: 6,
    killerId: 1,
    position: { x: 14820, y: 0 }
  },
  { id: 'dragon', timestamp: 300, type: 'ELITE_MONSTER_KILL' },
  { id: 'tower', timestamp: 400, type: 'BUILDING_KILL', position: { x: 16000, y: 5 } },
  { id: 'item', timestamp: 100, type: 'ITEM_PURCHASED', position: { x: 0, y: 0 } }
]
it('places events using map coordinates and preserves IDs for timeline navigation', () => {
  const result = mapEvents(events, 11, 1, 'all', 0, 1000)
  expect(result.points.map((p) => [p.event.id, p.left, p.top, p.category])).toEqual([
    ['death', 0, 0, 'deaths'],
    ['kill', 100, 100, 'kills']
  ])
  expect(result.missing).toBe(2)
})
it('filters by event category and inclusive time window without inventing locations', () => {
  expect(mapEvents(events, 11, 1, 'deaths', 100, 100).points).toHaveLength(1)
  expect(mapEvents(events, 11, 1, 'kills', 0, 100).points).toHaveLength(0)
  expect(mapEvents(events, 11, 1, 'objectives', 0, 1000)).toEqual({ points: [], missing: 1 })
  expect(mapEvents(events, 999, 1, 'all', 0, 1000)).toEqual({ points: [], missing: 0 })
})
it('filters by the acting team, including destroyed buildings, without assigning unknown killers', () => {
  const participants = [
    { id: 1, championId: 103, teamId: 100 },
    { id: 6, championId: 99, teamId: 200 }
  ]
  const input = [
    ...events,
    {
      id: 'building',
      type: 'BUILDING_KILL',
      timestamp: 500,
      teamId: 200,
      position: { x: 100, y: 100 }
    }
  ]
  expect(
    mapEvents(input, 11, 1, 'all', 0, 1000, 100, participants).points.map((p) => p.event.id)
  ).toEqual(['kill', 'building'])
  expect(
    mapEvents(input, 11, 1, 'all', 0, 1000, 200, participants).points.map((p) => p.event.id)
  ).toEqual(['death'])
})
