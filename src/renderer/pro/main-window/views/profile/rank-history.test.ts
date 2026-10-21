import type { RankPoint } from '@shared/pro/profile'
import { expect, it } from 'vitest'

import { rankIndex, rankPeriods } from './rank-history'

const point = (tier: string, division: string, leaguePoints = 0): RankPoint => ({
  id: 'capture',
  observedAt: 1,
  reason: 'manual',
  tier,
  division,
  leaguePoints,
  isProvisional: false,
  wins: 1,
  losses: 1
})

it('plots actual ordered ranks independently of LP resets and apex LP thresholds', () => {
  expect(rankIndex(point('PLATINUM', 'IV', 10))).toBeGreaterThan(rankIndex(point('GOLD', 'I', 90))!)
  expect(rankIndex(point('MASTER', 'I', 1000))).toBeLessThan(
    rankIndex(point('GRANDMASTER', 'I', 900))!
  )
  expect(rankIndex(point('NONE', 'NA'))).toBeNull()
  expect(rankIndex(point('GOLD', 'NA'))).toBeNull()
  expect(rankIndex(point('NEW_TIER', 'I'))).toBeNull()
})

it('groups local calendar intervals and retains the range across promotion and LP reset', () => {
  const values = [
    { ...point('GOLD', 'I', 90), observedAt: new Date(2026, 9, 19, 10).getTime() },
    { ...point('PLATINUM', 'IV', 12), observedAt: new Date(2026, 9, 19, 22).getTime() },
    { ...point('PLATINUM', 'IV', 40), observedAt: new Date(2026, 9, 20, 10).getTime() }
  ]
  const days = rankPeriods(values, 'day')
  expect(days).toHaveLength(2)
  expect(days[0].lp).toEqual([12, 90])
  expect(days[0].rank).toEqual([rankIndex(values[0]), rankIndex(values[1])])
  expect(days[0].point.leaguePoints).toBe(12)
  expect(rankPeriods(values, 'week')).toHaveLength(1)
  expect(rankPeriods(values, 'month')).toHaveLength(1)
  expect(rankPeriods([values[0], values[0]], 'record')).toHaveLength(2)
})
