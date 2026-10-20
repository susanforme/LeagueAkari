import type { LcuOrSgpGameDetails, SgpGameSummary } from '@shared/data-adapter/wrapper'
import snapshot from '@shared/test-fixtures/api/snapshots/2026-05-16-tencent-hn10/sgp/match-history-query/q_420.json'
import { expect, it } from 'vitest'

import { buildFromMatch } from './match-build'

it('imports the chosen player inventory and only their chronological skill upgrades', () => {
  const summary = {
    source: 'sgp',
    gameId: 123,
    data: structuredClone(snapshot.games[0])
  } as unknown as SgpGameSummary
  const player = summary.data.json.participants[0]
  Object.assign(player, {
    item0: 1001,
    item1: 1001,
    item2: 2003,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0
  })
  const source = { serverId: 'HN10', puuid: player.puuid, gameId: 123 }
  const details = {
    source: 'sgp',
    gameId: 123,
    data: {
      json: {
        frames: [
          {
            events: [
              {
                type: 'SKILL_LEVEL_UP',
                participantId: player.participantId,
                timestamp: 200,
                skillSlot: 2
              },
              {
                type: 'SKILL_LEVEL_UP',
                participantId: player.participantId,
                timestamp: 100,
                skillSlot: 1
              },
              { type: 'SKILL_LEVEL_UP', participantId: 99, timestamp: 50, skillSlot: 4 }
            ]
          }
        ]
      }
    }
  } as LcuOrSgpGameDetails
  expect(buildFromMatch(summary, source, details)).toMatchObject({
    championId: player.championId,
    groups: [
      {
        items: [
          { id: 1001, count: 2 },
          { id: 2003, count: 1 }
        ]
      }
    ],
    skillOrder: [1, 2],
    source
  })
  expect(buildFromMatch(summary, source, null).skillOrder).toEqual([])
  expect(() => buildFromMatch(summary, { ...source, puuid: 'missing' }, null)).toThrow()
})
