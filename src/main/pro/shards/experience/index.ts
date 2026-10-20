import { AutoGameflowMain } from '@main/shards/auto-gameflow'
import { AkariIpcMain } from '@main/shards/ipc'
import { LeagueClientMain } from '@main/shards/league-client'
import { LoggerFactoryMain } from '@main/shards/logger-factory'
import { SettingFactoryMain } from '@main/shards/setting-factory'
import { SgpMain } from '@main/shards/sgp'
import { WindowManagerMain } from '@main/shards/window-manager'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { EXPERIENCE_NAMESPACE } from '@shared/pro/experience'

import { ChampionPoolMain } from '../champion-pool'
import { ProStorageMain } from '../storage'
import { ExperienceController } from './experience-controller'
import { registerExperienceHandlers } from './ipc-handlers'

@Shard(ExperienceMain.id)
export class ExperienceMain implements IAkariShardInitDispose {
  static id = EXPERIENCE_NAMESPACE
  private readonly _controller: ExperienceController
  constructor(
    storage: ProStorageMain,
    leagueClient: LeagueClientMain,
    sgp: SgpMain,
    pool: ChampionPoolMain,
    settings: SettingFactoryMain,
    gameflow: AutoGameflowMain,
    windows: WindowManagerMain,
    loggerFactory: LoggerFactoryMain,
    private readonly _ipc: AkariIpcMain
  ) {
    this._controller = new ExperienceController({
      storage,
      leagueClient,
      sgp,
      pool,
      settings,
      gameflow,
      windows,
      logger: loggerFactory.create(ExperienceMain.id)
    })
  }
  async onInit() {
    registerExperienceHandlers(this._ipc, this._controller)
    await this._controller.start()
  }
  async onDispose() {
    await this._controller.dispose()
  }
}
