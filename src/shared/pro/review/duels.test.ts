import { expect, it } from 'vitest'

import { personalDuels } from './duels'
import type { ReviewAnalysis, ReviewEvent } from './index'

it('counts explicit unassisted player kills and retains evidence; unknown assists and executions are excluded', () => {
  const event: ReviewEvent = {
    id: 'kill',
    type: 'CHAMPION_KILL',
    timestamp: 100,
    killerId: 1,
    victimId: 6,
    assistingParticipantIds: []
  }
  const analysis = {
    participantId: 1,
    participants: [
      { id: 1, teamId: 100 },
      { id: 6, teamId: 200 },
      { id: 2, teamId: 100 }
    ],
    events: [
      event,
      { ...event, id: 'death', killerId: 6, victimId: 1 },
      { ...event, id: 'assisted', assistingParticipantIds: [2] },
      { ...event, id: 'unknown', assistingParticipantIds: undefined },
      { ...event, id: 'execution', killerId: 0, victimId: 1 },
      { ...event, id: 'same-team', victimId: 2 }
    ]
  } as ReviewAnalysis
  const result = personalDuels(analysis)
  expect(result.kills.map((e) => e.id)).toEqual(['kill'])
  expect(result.deaths.map((e) => e.id)).toEqual(['death'])
  expect(result.unknown).toBe(1)
})
