import { AkariIpcMain } from '@main/shards/ipc'
import { LeagueClientMain } from '@main/shards/league-client'
import { LoggerFactoryMain } from '@main/shards/logger-factory'
import { SgpMain } from '@main/shards/sgp'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import {
  CHAMPION_POOL_NAMESPACE,
  type PlayerIdentity,
  type SyncRequest
} from '@shared/pro/champion-pool'

import { ProStorageMain } from '../storage'
import { ChampionPoolController } from './champion-pool-controller'
import type { ChampionPoolContext } from './context'
import { registerChampionPoolHandlers } from './ipc-handlers'
import { ResourceLoader } from './resource-loader'

@Shard(ChampionPoolMain.id)
export class ChampionPoolMain implements IAkariShardInitDispose {
  static id = CHAMPION_POOL_NAMESPACE
  private readonly _context: ChampionPoolContext
  private readonly _controller: ChampionPoolController
  private readonly _resources: ResourceLoader

  constructor(
    storage: ProStorageMain,
    leagueClient: LeagueClientMain,
    sgp: SgpMain,
    ipc: AkariIpcMain,
    loggerFactory: LoggerFactoryMain
  ) {
    this._context = {
      storage,
      leagueClient,
      sgp,
      ipc,
      logger: loggerFactory.create(ChampionPoolMain.id)
    }
    this._controller = new ChampionPoolController(this._context)
    this._resources = new ResourceLoader(this._context, (key, failed) =>
      this._context.ipc.sendEvent(ChampionPoolMain.id, 'resources-changed', { key, failed })
    )
  }

  async onInit() {
    registerChampionPoolHandlers(this._context, this._controller, this._resources)
  }

  match(player: PlayerIdentity, gameId: number) {
    return this._controller.match(player, gameId)
  }

  details(player: PlayerIdentity, gameId: number, refresh = false) {
    return this._controller.details(player, gameId, refresh)
  }

  archive(request: SyncRequest) {
    return this._controller.archive(request)
  }

  async onDispose() {
    await this._controller.dispose()
    await this._resources.dispose()
  }
}
