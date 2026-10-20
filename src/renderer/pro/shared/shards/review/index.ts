import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import {
  REVIEW_NAMESPACE,
  type ReviewListItem,
  type ReviewReport,
  type ReviewRequest
} from '@shared/pro/review'

@Shard(ReviewRenderer.id)
export class ReviewRenderer {
  static id = 'pro-review-renderer'
  constructor(@Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer) {}
  open(request: ReviewRequest) {
    return this._ipc.call<ReviewReport>(REVIEW_NAMESPACE, 'open', request)
  }
  get(id: string) {
    return this._ipc.call<ReviewReport>(REVIEW_NAMESPACE, 'get', id)
  }
  list(page: number) {
    return this._ipc.call<{ items: ReviewListItem[]; total: number }>(REVIEW_NAMESPACE, 'list', {
      page
    })
  }
}
