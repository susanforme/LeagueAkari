import type { LcuGameSummary, LcuGameTimeline } from '@shared/data-adapter/wrapper'
import { eventWindow } from '@shared/pro/review'
import game from '@shared/test-fixtures/api/snapshots/2026-05-16-tencent-hn10/lcu/match-history/games/q_420.json'
import timeline from '@shared/test-fixtures/api/snapshots/2026-05-16-tencent-hn10/lcu/match-history/timelines/q_420.json'
import { describe, expect, it } from 'vitest'

import { analyzeMatch } from './analysis'
import { reviewFixture } from './test-fixtures'

describe('review evidence', () => {
  it('accepts captured LCU objective events with zero-filled unused fields without inventing lane opponents', () => {
    const result = analyzeMatch(
      { source: 'lcu', gameId: game.gameId, data: game } as LcuGameSummary,
      { source: 'lcu', gameId: game.gameId, data: timeline } as LcuGameTimeline,
      game.participantIdentities[0].player.puuid
    )
    expect(result.events.some((event) => event.type === 'ELITE_MONSTER_KILL')).toBe(true)
    expect(result.checkpoints[0].point?.gold).toBeGreaterThan(0)
    expect(result.opponentId).toBeNull()
  })
  it('uses observed snapshots and uniquely matched opponents, retaining event references', () => {
    const { summary, details } = reviewFixture()
    const result = analyzeMatch(summary, details, 'player')
    expect(result.checkpoints).toMatchObject([
      {
        target: 600_000,
        point: { timestamp: 600_000, gold: 4000, cs: 60, goldDiff: 1000, csDiff: 20 }
      },
      { target: 900_000, point: { gold: 6000 } }
    ])
    expect(result.events[0]).toMatchObject({ id: '10:0', victimId: 1, timestamp: 590_000 })
    const window = eventWindow(result, 599_000)
    expect(window.events).toHaveLength(2)
    expect(window.before?.timestamp).toBe(480_000)
    expect(window.after?.timestamp).toBe(600_000)
    expect(eventWindow(result, 0).from).toBe(0)
    expect(eventWindow(result, 599_000, 15_000).events).toHaveLength(2)
    expect(eventWindow(result, 599_000, 120_000).from).toBe(479_000)
    expect(() => eventWindow(result, 0, NaN)).toThrow('Invalid event window')
    expect(eventWindow(result, 1_190_000).to).toBe(1_200_000)
  })
  it('never substitutes a later, stale, or absent sample and preserves zero CS', () => {
    const { summary, details } = reviewFixture()
    details.data.json.frames = details.data.json.frames.filter(
      (f) => ![540_000, 600_000].includes(f.timestamp)
    )
    const at15 = details.data.json.frames.find((f) => f.timestamp === 900_000)!
    Object.assign(at15.participantFrames[1], { minionsKilled: 0, jungleMinionsKilled: 0, xp: null })
    const result = analyzeMatch(summary, details, 'player')
    expect(result.checkpoints[0].point).toBeNull()
    expect(result.checkpoints[1].point).toMatchObject({ cs: 0, xp: null })
    summary.data.json.gameDuration = 700
    expect(analyzeMatch(summary, details, 'player').checkpoints[1].point).toBeNull()
  })
  it('keeps lane differences unknown for ambiguous positions and rejects mismatched timelines', () => {
    const { summary, details } = reviewFixture()
    summary.data.json.participants[7].teamPosition = 'MIDDLE'
    expect(analyzeMatch(summary, details, 'player').checkpoints[0].point?.goldDiff).toBeNull()
    expect(analyzeMatch(summary, null, 'player').limitations).toContain('timelineMissing')
    details.data.json.gameId = 2
    expect(() => analyzeMatch(summary, details, 'player')).toThrow('identity mismatch')
  })
})
