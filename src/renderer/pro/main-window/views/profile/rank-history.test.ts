import type { RankPoint } from '@shared/pro/profile'
import { expect, it } from 'vitest'

import { previousRankPoint, rankIndex } from './rank-history'

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

it('retains the previous observation across pagination, but not missing seasons or placement gaps', () => {
  const points = Array.from({ length: 32 }, (_, i) => ({ ...point('GOLD', 'I', i), id: String(i) }))
  expect(previousRankPoint(points, 30, 2026)?.id).toBe('29')
  expect(previousRankPoint(points, 0, 2026)).toBeNull()
  expect(previousRankPoint(points, 30, null)).toBeNull()
  points[29].isProvisional = true
  expect(previousRankPoint(points, 30, 2026)).toBeNull()
  points[29] = point('NONE', 'NA')
  expect(previousRankPoint(points, 30, 2026)).toBeNull()
})
