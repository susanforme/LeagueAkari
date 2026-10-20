import type { SgpGameDetails, SgpGameSummary } from '@shared/data-adapter/wrapper'

import { sgpSummary } from '../champion-pool/test-fixtures'

export function reviewFixture() {
  const summary = sgpSummary()
  Object.assign(summary.data.json, { mapId: 11, gameMode: 'CLASSIC' })
  const base = summary.data.json.participants[0]
  summary.data.json.participants = Array.from({ length: 10 }, (_, index) => ({
    ...base,
    participantId: index + 1,
    puuid: index === 0 ? 'player' : `other-${index}`,
    teamId: index < 5 ? 100 : 200,
    teamPosition: ['MIDDLE', 'TOP', 'JUNGLE', 'BOTTOM', 'UTILITY'][index % 5]
  })) as SgpGameSummary['data']['json']['participants']
  const details: SgpGameDetails = {
    source: 'sgp',
    gameId: 1,
    data: {
      json: {
        gameId: 1,
        participants: summary.data.json.participants.map((p) => ({
          participantId: p.participantId,
          puuid: p.puuid
        })),
        frames: Array.from({ length: 21 }, (_, minute) => ({
          timestamp: minute * 60_000,
          participantFrames: {
            1: {
              totalGold: minute * 400,
              minionsKilled: minute * 5,
              jungleMinionsKilled: minute,
              xp: minute * 300
            },
            6: {
              totalGold: minute * 300,
              minionsKilled: minute * 4,
              jungleMinionsKilled: 0,
              xp: minute * 200
            }
          },
          events:
            minute === 10
              ? [
                  { type: 'CHAMPION_KILL', timestamp: 590_000, killerId: 6, victimId: 1 },
                  {
                    type: 'ELITE_MONSTER_KILL',
                    timestamp: 599_000,
                    killerId: 6,
                    monsterType: 'DRAGON'
                  }
                ]
              : []
        }))
      }
    }
  } as unknown as SgpGameDetails
  return { summary, details }
}
