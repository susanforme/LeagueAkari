import type { AkariIpcMain } from '@main/shards/ipc'
import { playerSchema } from '@shared/pro/champion-pool'
import {
  PROGRESS_NAMESPACE,
  batchSchema,
  goalChangeSchema,
  goalSchema,
  insightSchema
} from '@shared/pro/progress'
import { z } from 'zod'

import type { ProgressController } from './progress-controller'

const pageSchema = z.number().int().min(1).max(100000)
export function registerProgressHandlers(ipc: AkariIpcMain, controller: ProgressController) {
  ipc.onCall(PROGRESS_NAMESPACE, 'insights', (_, q) => {
    const r = insightSchema.parse(q)
    return controller.insights(r.reportId, r.allChampions)
  })
  ipc.onCall(PROGRESS_NAMESPACE, 'createGoal', (_, q) => controller.createGoal(goalSchema.parse(q)))
  ipc.onCall(PROGRESS_NAMESPACE, 'changeGoal', (_, q) =>
    controller.changeGoal(goalChangeSchema.parse(q))
  )
  ipc.onCall(PROGRESS_NAMESPACE, 'goals', (_, q) => controller.goals(pageSchema.parse(q)))
  ipc.onCall(PROGRESS_NAMESPACE, 'progress', (_, q) =>
    controller.progress(z.string().uuid().parse(q))
  )
  ipc.onCall(PROGRESS_NAMESPACE, 'candidates', (_, q) => {
    const r = playerSchema.extend({ page: pageSchema }).parse(q)
    return controller.candidates(r, r.page)
  })
  ipc.onCall(PROGRESS_NAMESPACE, 'preview', (_, q) => controller.preview(batchSchema.parse(q)))
  ipc.onCall(PROGRESS_NAMESPACE, 'batches', () => controller.batches())
  ipc.onCall(PROGRESS_NAMESPACE, 'runBatch', (_, q) =>
    controller.runBatch(z.string().uuid().parse(q))
  )
  ipc.onCall(PROGRESS_NAMESPACE, 'cancel', () => controller.cancel())
}
