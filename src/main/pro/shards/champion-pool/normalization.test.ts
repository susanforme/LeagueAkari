import type { LcuGameSummary } from '@shared/data-adapter/wrapper'
import { expect, it } from 'vitest'

import { normalizeMatch } from './normalization'
import { sgpSummary } from './test-fixtures'

it('normalizes SGP summaries and preserves missing or zero denominator metrics', () => {
  const summary = sgpSummary()
  expect(normalizeMatch(summary, 'player')).toMatchObject({
    patch: '26.20',
    csPerMin: 6,
    damageShare: 0.2,
    outcome: 'win',
    killParticipation: 0.3,
    visionPerMin: 0.8
  })
  summary.data.json.participants[1].totalDamageDealtToChampions = undefined as unknown as number
  expect(normalizeMatch(summary, 'player').damageShare).toBeNull()
  summary.data.json.gameDuration = 0
  expect(normalizeMatch(summary, 'player').csPerMin).toBeNull()
  summary.data.json.participants[0].gameEndedInEarlySurrender = true
  expect(normalizeMatch(summary, 'player').outcome).toBe('remake')
  expect(() => normalizeMatch(summary, 'someone-else')).toThrow()
})

it('does not turn a single-player LCU history into a 100% damage share', () => {
  const summary = {
    source: 'lcu',
    gameId: 7,
    data: {
      gameId: 7,
      gameCreation: 2000,
      gameDuration: 600,
      gameVersion: '26.20.1',
      queueId: 420,
      participantIdentities: [{ participantId: 1, player: { puuid: 'player' } }],
      participants: [
        {
          participantId: 1,
          championId: 64,
          teamId: 100,
          stats: {
            kills: 0,
            deaths: 0,
            assists: 0,
            totalDamageDealtToChampions: 100,
            totalMinionsKilled: 0,
            neutralMinionsKilled: 0,
            win: false
          }
        }
      ]
    }
  } as LcuGameSummary
  expect(normalizeMatch(summary, 'player')).toMatchObject({
    championId: 64,
    position: 'UNKNOWN',
    csPerMin: 0,
    damageShare: null,
    killParticipation: null,
    visionPerMin: null,
    outcome: 'loss'
  })
})

it('does not infer missing team kills or turn absent vision into zero', () => {
  const summary = sgpSummary()
  summary.data.json.participants[0].visionScore = undefined as unknown as number
  summary.data.json.participants[1].kills = undefined as unknown as number
  expect(normalizeMatch(summary, 'player')).toMatchObject({
    killParticipation: null,
    visionPerMin: null
  })
  for (const participant of summary.data.json.participants) participant.kills = 0
  expect(normalizeMatch(summary, 'player').killParticipation).toBeNull()
})
