import type { AkariIpcMain } from '@main/shards/ipc'
import {
  REVIEW_NAMESPACE,
  reportIdSchema,
  reviewListSchema,
  reviewRequestSchema
} from '@shared/pro/review'

import type { ReviewController } from './review-controller'

export function registerReviewHandlers(ipc: AkariIpcMain, controller: ReviewController) {
  ipc.onCall(REVIEW_NAMESPACE, 'open', (_, query) =>
    controller.open(reviewRequestSchema.parse(query))
  )
  ipc.onCall(REVIEW_NAMESPACE, 'get', (_, id) => controller.get(reportIdSchema.parse(id)))
  ipc.onCall(REVIEW_NAMESPACE, 'list', (_, query) =>
    controller.list(reviewListSchema.parse(query).page)
  )
}
