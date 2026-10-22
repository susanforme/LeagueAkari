import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import {
  REVIEW_NAMESPACE,
  type ReviewLibrary,
  type ReviewListQuery,
  type ReviewRemoveResult,
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
  list(query: Partial<ReviewListQuery> | number) {
    return this._ipc.call<ReviewLibrary>(
      REVIEW_NAMESPACE,
      'list',
      typeof query === 'number' ? { page: query } : query
    )
  }
  remove(id: string) {
    return this._ipc.call<ReviewRemoveResult>(REVIEW_NAMESPACE, 'remove', id)
  }
}
