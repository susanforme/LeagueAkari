import { describe, expect, it } from 'vitest'

import { adjacentEvent, groupEvents, parseTime, timelineRange } from './navigation'

const events = [
  { id: 'a', timestamp: 10_000, type: 'CHAMPION_KILL' },
  { id: 'b', timestamp: 10_000, type: 'CHAMPION_KILL' },
  { id: 'c', timestamp: 10_100, type: 'CHAMPION_KILL' },
  { id: 'd', timestamp: 60_000, type: 'BUILDING_KILL' }
]
describe('review timeline navigation', () => {
  it('accepts game-clock input without silently clamping invalid input', () => {
    expect(parseTime('12:34', 900_000)).toBe(754_000)
    expect(parseTime('100:00', 6_000_000)).toBe(6_000_000)
    for (const input of ['12:60', '-1:00', '12', '15:01', 'NaN:00'])
      expect(parseTime(input, 900_000)).toBeNull()
  })
  it('visits every event at identical timestamps and does not wrap at boundaries', () => {
    expect(adjacentEvent(events, 10_000, 'a', 1)?.id).toBe('b')
    expect(adjacentEvent(events, 10_000, 'b', -1)?.id).toBe('a')
    expect(adjacentEvent(events, 10_000, null, 1)?.id).toBe('a')
    expect(adjacentEvent(events, 11_000, 'b', -1)?.id).toBe('c')
    expect(adjacentEvent(events, 60_000, 'd', 1)).toBeUndefined()
    expect(adjacentEvent([], 0, null, 1)).toBeUndefined()
  })
  it('keeps zoom inside short and late games', () => {
    expect(timelineRange(10_000, 60_000, 180_000)).toEqual({ from: 0, to: 60_000 })
    expect(timelineRange(590_000, 600_000, 180_000)).toEqual({ from: 420_000, to: 600_000 })
    expect(timelineRange(0, 0, 180_000)).toEqual({ from: 0, to: 0 })
  })
  it('preserves all events in dense clusters, including endpoints, without overlapping hit targets', () => {
    expect(groupEvents([events[0]], 0, 60_000, 600)[0].left).toBeCloseTo(100 / 6)
    const groups = groupEvents(events, 0, 60_000, 96)
    expect(groups.map((group) => group.events.map((e) => e.id))).toEqual([['a', 'b', 'c'], ['d']])
    expect(groups.every((group) => group.left > 0 && group.left < 100)).toBe(true)
    expect(
      groupEvents(events, 10_050, 60_000, 0).flatMap((g) => g.events.map((e) => e.id))
    ).toEqual(['c', 'd'])
  })
})
