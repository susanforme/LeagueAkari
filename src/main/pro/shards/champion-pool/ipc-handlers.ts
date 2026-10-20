import {
  CHAMPION_POOL_NAMESPACE,
  matchQuerySchema,
  playerSchema,
  querySchema,
  resourceLocaleSchema,
  syncSchema
} from '@shared/pro/champion-pool'
import { matchupQuerySchema } from '@shared/pro/champion-pool/matchups'
import { z } from 'zod'

import type { ChampionPoolController } from './champion-pool-controller'
import type { ChampionPoolContext } from './context'
import type { ResourceLoader } from './resource-loader'

export function registerChampionPoolHandlers(
  context: ChampionPoolContext,
  controller: ChampionPoolController,
  resources: ResourceLoader
) {
  const { ipc } = context
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'getResources', (_, locale) =>
    resources.get(resourceLocaleSchema.parse(locale))
  )
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'getStatus', () => controller.status())
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'listPlayers', () => controller.players())
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'query', (_, request) =>
    controller.query(querySchema.parse(request))
  )
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'matchups', (_, request) =>
    controller.matchups(matchupQuerySchema.parse(request))
  )
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'queryMatches', (_, request) =>
    controller.matches(matchQuerySchema.parse(request))
  )
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'startSync', (_, request) =>
    controller.start(syncSchema.parse(request))
  )
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'cancelSync', () => controller.cancel())
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'retrySync', () => controller.retry())
  ipc.onCall(CHAMPION_POOL_NAMESPACE, 'getMatchDetails', (_, request) => {
    const match = playerSchema.extend({ gameId: z.number().int().positive() }).parse(request)
    return controller.details(match, match.gameId)
  })
}
