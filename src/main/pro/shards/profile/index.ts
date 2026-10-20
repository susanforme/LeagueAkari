import { AkariIpcMain } from '@main/shards/ipc'
import { LeagueClientMain } from '@main/shards/league-client'
import { LoggerFactoryMain } from '@main/shards/logger-factory'
import { SgpMain } from '@main/shards/sgp'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { PROFILE_NAMESPACE } from '@shared/pro/profile'

import { ProStorageMain } from '../storage'
import { registerProfileHandlers } from './ipc-handlers'
import { ProfileController } from './profile-controller'

@Shard(ProfileMain.id)
export class ProfileMain implements IAkariShardInitDispose {
  static id = PROFILE_NAMESPACE
  private readonly _controller: ProfileController
  constructor(
    storage: ProStorageMain,
    leagueClient: LeagueClientMain,
    sgp: SgpMain,
    loggerFactory: LoggerFactoryMain,
    private readonly _ipc: AkariIpcMain
  ) {
    this._controller = new ProfileController(
      () => storage.dataSource,
      leagueClient,
      sgp,
      loggerFactory.create(ProfileMain.id)
    )
  }
  async onInit() {
    registerProfileHandlers(this._ipc, this._controller)
    this._controller.start()
  }
  async onDispose() {
    await this._controller.dispose()
  }
}
