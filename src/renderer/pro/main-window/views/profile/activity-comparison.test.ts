import type { ActivityPeriod } from '@shared/pro/profile'
import { expect, it } from 'vitest'

import { activityChanges } from './activity-comparison'

it('compares weeks without inventing a zero baseline or using incomplete durations', () => {
  const previous: ActivityPeriod = {
    games: 4,
    activeDays: 2,
    wins: 2,
    losses: 2,
    durationSeconds: 4000,
    durationSamples: 4
  }
  const current = {
    ...previous,
    games: 6,
    activeDays: 3,
    wins: 4,
    durationSeconds: 6000,
    durationSamples: 6
  }
  expect(activityChanges(current, previous)).toMatchObject({
    games: 50,
    activeDays: 50,
    duration: 50
  })
  expect(activityChanges(current, previous).winRate).toBeCloseTo(16.6667)
  expect(activityChanges({ ...current, durationSamples: 5 }, previous).duration).toBeNull()
  expect(
    activityChanges(current, {
      ...previous,
      games: 0,
      activeDays: 0,
      wins: 0,
      losses: 0,
      durationSamples: 0,
      durationSeconds: 0
    })
  ).toEqual({ games: null, activeDays: null, duration: null, winRate: null })
})
