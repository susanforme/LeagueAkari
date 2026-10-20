import { AkariIpcMain } from '@main/shards/ipc'
import { LeagueClientMain } from '@main/shards/league-client'
import { LoggerFactoryMain } from '@main/shards/logger-factory'
import { SgpMain } from '@main/shards/sgp'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { NOTEBOOK_NAMESPACE } from '@shared/pro/notebook'

import { ProStorageMain } from '../storage'
import { BuildSyncController } from './build-sync-controller'
import { registerNotebookHandlers } from './ipc-handlers'
import { NotebookController } from './notebook-controller'
import { NotebookResourceLoader } from './resource-loader'

@Shard(NotebookMain.id)
export class NotebookMain implements IAkariShardInitDispose {
  static id = NOTEBOOK_NAMESPACE
  private readonly _controller: NotebookController
  private readonly _resources: NotebookResourceLoader
  private readonly _builds: BuildSyncController
  constructor(
    private readonly storage: ProStorageMain,
    league: LeagueClientMain,
    sgp: SgpMain,
    loggerFactory: LoggerFactoryMain,
    private readonly _ipc: AkariIpcMain
  ) {
    this._controller = new NotebookController(() => storage.dataSource)
    this._resources = new NotebookResourceLoader(() => storage.dataSource)
    const logger = loggerFactory.create(NotebookMain.id)
    this._builds = new BuildSyncController(
      () => storage.dataSource,
      this._controller,
      league,
      sgp,
      (error) => logger.warn('Build synchronization failed', error)
    )
  }
  async onInit() {
    registerNotebookHandlers(this._ipc, this._controller, this._resources, this._builds)
    if (this.storage.status === 'ready') this._builds.start()
  }
  async onDispose() {
    await this._builds.dispose()
    await this._resources.dispose()
    await this._controller.dispose()
  }
}
