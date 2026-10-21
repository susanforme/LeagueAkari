import type { SgpGameSummary } from '@shared/data-adapter/wrapper'

export function sgpSummary(gameId = 1): SgpGameSummary {
  return {
    source: 'sgp',
    gameId,
    data: {
      json: {
        gameId,
        gameCreation: 1000,
        gameDuration: 1200,
        gameVersion: '26.20.1',
        queueId: 420,
        participants: Array.from({ length: 5 }, (_, index) => ({
          puuid: index === 0 ? 'player' : `teammate-${index}`,
          teamId: 100,
          championId: 103,
          teamPosition: 'MIDDLE',
          kills: 8,
          assists: 4,
          deaths: 2,
          visionScore: 16,
          totalDamageDealtToChampions: 1000,
          totalMinionsKilled: 100,
          neutralMinionsKilled: 20,
          win: true
        }))
      }
    }
  } as SgpGameSummary
}
