import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import type { LcuOrSgpGameDetails } from '@shared/data-adapter/wrapper'
import {
  CHAMPION_POOL_NAMESPACE,
  type PlayerIdentity,
  type PoolMatchPage,
  type PoolMatchQuery,
  type PoolPlayer,
  type PoolQuery,
  type PoolResult,
  type PoolStatus,
  type ResourceCatalog,
  type ResourceLocale,
  type SyncRequest
} from '@shared/pro/champion-pool'

@Shard(ChampionPoolRenderer.id)
export class ChampionPoolRenderer {
  static id = 'pro-champion-pool-renderer'
  constructor(@Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer) {}

  resources(locale: ResourceLocale) {
    return this._ipc.call<ResourceCatalog>(CHAMPION_POOL_NAMESPACE, 'getResources', locale)
  }

  status() {
    return this._ipc.call<PoolStatus>(CHAMPION_POOL_NAMESPACE, 'getStatus')
  }
  players() {
    return this._ipc.call<PoolPlayer[]>(CHAMPION_POOL_NAMESPACE, 'listPlayers')
  }
  query(query: PoolQuery) {
    return this._ipc.call<PoolResult>(CHAMPION_POOL_NAMESPACE, 'query', query)
  }
  matches(query: PoolMatchQuery) {
    return this._ipc.call<PoolMatchPage>(CHAMPION_POOL_NAMESPACE, 'queryMatches', query)
  }
  startSync(request: SyncRequest) {
    return this._ipc.call<PoolStatus>(CHAMPION_POOL_NAMESPACE, 'startSync', request)
  }
  cancelSync() {
    return this._ipc.call<void>(CHAMPION_POOL_NAMESPACE, 'cancelSync')
  }
  retrySync() {
    return this._ipc.call<PoolStatus>(CHAMPION_POOL_NAMESPACE, 'retrySync')
  }
  details(player: PlayerIdentity, gameId: number) {
    return this._ipc.call<LcuOrSgpGameDetails | null>(CHAMPION_POOL_NAMESPACE, 'getMatchDetails', {
      ...player,
      gameId
    })
  }
  onChanged(callback: () => void) {
    return this._ipc.onEventVue(CHAMPION_POOL_NAMESPACE, 'cache-changed', callback)
  }
}
