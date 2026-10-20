import type { PoolMatch } from '@shared/pro/champion-pool'
import { describe, expect, it } from 'vitest'

import { summarizeActivity } from './activity'

describe('profile activity windows', () => {
  it('separates adjacent weeks, excludes remakes and future games, and retains missing-data counts', () => {
    const now = new Date(2026, 9, 20, 12).getTime()
    const day = 86_400_000
    const entry = (days: number, outcome: PoolMatch['outcome'], duration: number | null) => ({
      match: { startedAt: now - days * day, outcome } as PoolMatch,
      duration
    })
    const result = summarizeActivity(
      [
        entry(1, 'win', 1800),
        entry(1, 'unknown', null),
        entry(2, 'remake', 120),
        entry(7, 'loss', 1200),
        entry(8, 'win', 1800),
        entry(14, 'loss', 1500),
        entry(30, 'win', 900),
        entry(31, 'win', 3600),
        entry(-1, 'win', 3600)
      ],
      now,
      false
    )
    expect(result.month).toEqual({
      games: 5,
      activeDays: 4,
      wins: 2,
      losses: 2,
      durationSeconds: 6300,
      durationSamples: 4
    })
    expect(result.recentWeek).toEqual({
      games: 3,
      activeDays: 2,
      wins: 1,
      losses: 1,
      durationSeconds: 3000,
      durationSamples: 2
    })
    expect(result.previousWeek.games).toBe(2)
    expect(summarizeActivity([], now, false).month).toEqual({
      games: 0,
      activeDays: 0,
      wins: 0,
      losses: 0,
      durationSeconds: 0,
      durationSamples: 0
    })
  })
  it('returns 30 local calendar days including empty days and assigns midnight to the next day', () => {
    const now = new Date(2024, 2, 15, 12).getTime()
    const midnight = new Date(2024, 2, 10).getTime()
    const result = summarizeActivity(
      [midnight - 1, midnight].map((startedAt) => ({
        match: { startedAt, outcome: 'win' } as PoolMatch,
        duration: 1200
      })),
      now,
      false
    )
    expect(result.days).toHaveLength(30)
    expect(new Date(result.days[0].date).getDate()).toBe(15)
    expect(new Date(result.days[0].date).getMonth()).toBe(1)
    expect(result.days.find((day) => day.date === midnight)?.games).toBe(1)
    expect(result.days.filter((day) => day.games)).toHaveLength(2)
    expect(result.days.at(-1)?.games).toBe(0)
    expect(result.days.reduce((sum, day) => sum + day.games, 0)).toBe(result.month.games)
    expect(result.days.every((day) => new Date(day.date).getHours() === 0)).toBe(true)
  })
})
