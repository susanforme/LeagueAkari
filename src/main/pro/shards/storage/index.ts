import { AkariIpcMain } from '@main/shards/ipc'
import { LoggerFactoryMain } from '@main/shards/logger-factory'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import type { PoolStatus } from '@shared/pro/champion-pool'
import { app } from 'electron'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { z } from 'zod'

import { BackupController } from './backup-controller'
import { NewerDatabaseVersionError, initializeProDatabase } from './database-lifecycle'

@Shard(ProStorageMain.id)
export class ProStorageMain implements IAkariShardInitDispose {
  static id = 'pro-storage-main'
  status: PoolStatus['storage'] = 'unavailable'
  private readonly _dataSource: DataSource
  private readonly _backup: BackupController
  private readonly _logger

  constructor(
    loggerFactory: LoggerFactoryMain,
    private readonly _ipc: AkariIpcMain
  ) {
    this._backup = new BackupController(() => this._dataSource, app.getPath('userData'))
    this._logger = loggerFactory.create(ProStorageMain.id)
    this._dataSource = new DataSource({
      type: 'better-sqlite3',
      database: join(app.getPath('userData'), 'ProFeatures.db'),
      synchronize: false,
      entities: []
    })
  }

  get dataSource() {
    if (this.status !== 'ready') throw new Error('Pro database is unavailable')
    return this._dataSource
  }

  async onInit() {
    try {
      await initializeProDatabase(this._dataSource)
      try {
        await this._backup.applyPending()
      } catch (error) {
        this._logger.error('Pro restore failed; original data retained', error)
      }
      this.status = 'ready'
      this._ipc.onCall(ProStorageMain.id, 'restoreStatus', () => this._backup.status)
      this._ipc.onCall(ProStorageMain.id, 'backup', () => this._backup.exportFile())
      this._ipc.onCall(ProStorageMain.id, 'prepareRestore', () => this._backup.prepareFile())
      this._ipc.onCall(ProStorageMain.id, 'restore', (_, token) =>
        this._backup.stage(z.string().uuid().parse(token))
      )
    } catch (error) {
      if (
        !(error instanceof NewerDatabaseVersionError) &&
        !(error instanceof Error && /SQLITE_|database|ENOENT|EACCES|EPERM/i.test(error.message))
      ) {
        throw error
      }
      this.status = error instanceof NewerDatabaseVersionError ? 'newer-version' : 'unavailable'
      this._logger.error('Pro database could not be opened; original file retained', error)
      if (this._dataSource.isInitialized) await this._dataSource.destroy()
    }
  }

  async onDispose() {
    await this._backup.dispose()
    if (this._dataSource.isInitialized) await this._dataSource.destroy()
  }
}
