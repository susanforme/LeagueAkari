import { AkariIpcMain } from '@main/shards/ipc'
import { type IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { REVIEW_NAMESPACE } from '@shared/pro/review'

import { ChampionPoolMain } from '../champion-pool'
import { ProStorageMain } from '../storage'
import { registerReviewHandlers } from './ipc-handlers'
import { ReviewController } from './review-controller'

@Shard(ReviewMain.id)
export class ReviewMain implements IAkariShardInitDispose {
  static id = REVIEW_NAMESPACE
  private readonly _controller: ReviewController
  constructor(
    storage: ProStorageMain,
    pool: ChampionPoolMain,
    private readonly _ipc: AkariIpcMain
  ) {
    this._controller = new ReviewController(() => storage.dataSource, pool)
  }
  async onInit() {
    registerReviewHandlers(this._ipc, this._controller)
  }
  get(id: string) {
    return this._controller.get(id)
  }
  open(request: import('@shared/pro/review').ReviewRequest) {
    return this._controller.open(request)
  }
  async onDispose() {
    await this._controller.dispose()
  }
}
