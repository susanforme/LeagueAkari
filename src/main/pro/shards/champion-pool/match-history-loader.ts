import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import type { SyncRequest } from '@shared/pro/champion-pool'

import type { ChampionPoolContext } from './context'

export function selectHistorySource(options: {
  connected: boolean
  currentServer: string
  targetServer: string
  preferredSource: 'sgp' | 'lcu'
  matchHistorySupported: boolean
  tokenReady: boolean
}): 'sgp' | 'lcu' {
  if (!options.connected) throw new Error('disconnected')
  // The migrated feature, like RiftMind, only synchronizes the connected region.
  if (!options.currentServer || options.currentServer !== options.targetServer)
    throw new Error('differentServer')
  if (options.preferredSource === 'lcu' || !options.matchHistorySupported) return 'lcu'
  if (!options.tokenReady) throw new Error('waitingToken')
  return 'sgp'
}

export class MatchHistoryLoader {
  constructor(private readonly _context: ChampionPoolContext) {}

  source(request: SyncRequest) {
    const { leagueClient, sgp } = this._context
    return selectHistorySource({
      connected: leagueClient.state.isConnected,
      currentServer: sgp.state.availability.sgpServerId,
      targetServer: request.serverId,
      preferredSource: request.preferredSource,
      matchHistorySupported: !!sgp.state.leagueServers.servers[request.serverId]?.matchHistory,
      tokenReady: sgp.state.isTokenReady
    })
  }

  async loadPage(
    request: SyncRequest,
    source: 'sgp' | 'lcu',
    start: number,
    count: number,
    signal: AbortSignal,
    cached = new Set<number>()
  ): Promise<LcuOrSgpGameSummary[]> {
    const { leagueClient, sgp } = this._context
    const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) }
    if (source === 'sgp') {
      const { data } = await sgp.api.matchHistoryQuery.getMatchHistorySummaryByPlayerPuuid(
        request.puuid,
        {
          __sgpServerId: request.serverId,
          startIndex: start,
          count,
          ...options
        }
      )
      return data.games.map((game) => ({ source: 'sgp', gameId: game.json.gameId, data: game }))
    }
    const { data } = await leagueClient.api.matchHistory.getMatchHistory(
      request.puuid,
      start,
      start + count - 1,
      options
    )
    const games: LcuOrSgpGameSummary[] = []
    for (const game of data.games.games) {
      signal.throwIfAborted()
      let full = game
      if (game.participants.length < 10 && !cached.has(game.gameId)) {
        try {
          full = (
            await leagueClient.api.matchHistory.getGame(game.gameId, {
              signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)])
            })
          ).data
        } catch {
          signal.throwIfAborted()
          // Partial summaries still provide K/D/A; unavailable team metrics remain missing.
          this._context.logger.warn(
            `Champion pool: full summary unavailable for game ${game.gameId}`
          )
        }
      }
      games.push({ source: 'lcu', gameId: full.gameId, data: full })
    }
    return games
  }
}
