import { describe, expect, it } from 'vitest'

import { normalizeMatch } from '../../../main/pro/shards/champion-pool/normalization'
import { sgpSummary } from '../../../main/pro/shards/champion-pool/test-fixtures'
import { type CachedGame, preferencesSchema, reminderSettingsSchema } from './index'
import { playReminder } from './play-reminder'

function game(
  id: number,
  start: number,
  outcome: CachedGame['match']['outcome'] = 'loss'
): CachedGame {
  const summary = sgpSummary(id)
  summary.data.json.gameCreation = start
  summary.data.json.gameDuration = 1800
  return { summary, match: { ...normalizeMatch(summary, 'player'), outcome } }
}
const settings = reminderSettingsSchema.parse({ enabled: true, games: 3, minutes: 90, losses: 3 })
describe('post-game reminders', () => {
  it('keeps old preferences disabled and rejects invalid thresholds', () => {
    expect(preferencesSchema.parse({ restore: true, archive: true }).reminder.enabled).toBe(false)
    expect(reminderSettingsSchema.safeParse({ ...settings, minutes: -1 }).success).toBe(false)
  })
  it('triggers at exact thresholds, skips remakes in the loss streak and disables individual rules', () => {
    const games = [game(1, 0), game(2, 2000000, 'remake'), game(3, 4000000), game(4, 6000000)]
    expect(playReminder(games, settings, 4, 7800000)).toMatchObject({
      games: 3,
      minutes: 120,
      losses: 3,
      reasons: ['games', 'minutes', 'losses']
    })
    expect(playReminder(games, { ...settings, games: 0, minutes: 0 }, 4, 7800000)?.reasons).toEqual(
      ['losses']
    )
    expect(
      playReminder(games, { ...settings, games: 0, minutes: 0, losses: 0 }, 4, 7800000)
    ).toBeNull()
  })
  it('does not notify for historical imports, missing settlement, remakes, or old sessions', () => {
    const games = [game(1, 0), game(2, 2000000), game(3, 4000000)]
    expect(playReminder(games, settings, 2, 5800000)).toBeNull()
    expect(playReminder(games, settings, 3, 5800000 + 7200001)).toBeNull()
    expect(playReminder([...games, game(4, 15000000)], settings, 4, 16800000)).toBeNull()
    expect(playReminder([...games, game(4, 6000000, 'remake')], settings, 4, 7800000)).toBeNull()
    expect(playReminder(games, { ...settings, enabled: false }, 3, 5800000)).toBeNull()
  })
  it('ends the loss streak on an unknown result or win', () => {
    for (const outcome of ['win', 'unknown'] as const) {
      const games = [game(1, 0), game(2, 2000000, outcome), game(3, 4000000)]
      expect(playReminder(games, { ...settings, games: 0, minutes: 0 }, 3, 5800000)).toBeNull()
    }
  })
})
