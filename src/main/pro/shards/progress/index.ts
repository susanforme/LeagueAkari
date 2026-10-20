import { AkariIpcMain } from '@main/shards/ipc'
import { LeagueClientMain } from '@main/shards/league-client'
import { LoggerFactoryMain } from '@main/shards/logger-factory'
import { SgpMain } from '@main/shards/sgp'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { PROGRESS_NAMESPACE } from '@shared/pro/progress'

import { ReviewMain } from '../review'
import { ProStorageMain } from '../storage'
import { registerProgressHandlers } from './ipc-handlers'
import { ProgressController } from './progress-controller'

@Shard(ProgressMain.id)
export class ProgressMain implements IAkariShardInitDispose {
  static id = PROGRESS_NAMESPACE
  private readonly _controller: ProgressController
  constructor(
    private readonly _storage: ProStorageMain,
    reviews: ReviewMain,
    leagueClient: LeagueClientMain,
    sgp: SgpMain,
    private readonly _ipc: AkariIpcMain,
    loggerFactory: LoggerFactoryMain
  ) {
    const logger = loggerFactory.create(ProgressMain.id)
    this._controller = new ProgressController(
      () => _storage.dataSource,
      reviews,
      () =>
        JSON.stringify([
          leagueClient.state.isConnected,
          leagueClient.state.auth?.pid,
          leagueClient.data.summoner.me?.puuid,
          sgp.state.availability.sgpServerId
        ]),
      (error) => logger.warn('Review batch failed', error)
    )
  }
  async onInit() {
    registerProgressHandlers(this._ipc, this._controller)
    if (this._storage.status === 'ready') await this._controller.initialize()
  }
  async onDispose() {
    await this._controller.dispose()
  }
}
