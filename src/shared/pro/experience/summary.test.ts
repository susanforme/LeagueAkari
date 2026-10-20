import { describe, expect, it } from 'vitest'

import { normalizeMatch } from '../../../main/pro/shards/champion-pool/normalization'
import { sgpSummary } from '../../../main/pro/shards/champion-pool/test-fixtures'
import { partnerSummary, sessionSummary } from './summary'

function game(id: number, start: number) {
  const summary = sgpSummary(id)
  summary.data.json.gameCreation = start
  summary.data.json.gameDuration = 1800
  summary.data.json.participants.forEach((p, i) => {
    p.puuid = i === 0 ? 'player' : `other-${i}`
    p.teamId = i < 3 ? 100 : 200
  })
  return { summary, match: normalizeMatch(summary, 'player') }
}
describe('session and teammate summaries', () => {
  it('groups by gaps after game end, counts remakes separately and sums playing time', () => {
    const games = [game(1, 0), game(2, 3 * 3600000), game(3, 4 * 3600000)]
    games[2].match.outcome = 'remake'
    expect(sessionSummary(games)).toMatchObject({
      from: 3 * 3600000,
      games: 2,
      wins: 1,
      remakes: 1,
      durationSeconds: 3600,
      gameIds: [3, 2]
    })
    expect(sessionSummary([])).toBeNull()
  })
  it('counts only repeated same-team players and excludes remakes and duplicate games', () => {
    const a = game(1, 0),
      b = game(2, 3600000),
      c = game(3, 7200000)
    b.match.outcome = 'loss'
    c.match.outcome = 'remake'
    const partners = partnerSummary([a, b, c, a], 'player')
    expect(partners.map((p) => p.puuid)).toEqual(['other-1', 'other-2'])
    expect(partners[0]).toMatchObject({ games: 2, wins: 1, losses: 1, gameIds: [1, 2] })
    expect(partners[0].combinations[0].games).toBe(2)
    expect(partnerSummary([a], 'player')).toEqual([])
  })
})
