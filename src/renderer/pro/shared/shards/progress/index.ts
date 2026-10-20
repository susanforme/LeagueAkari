import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import type { PlayerIdentity } from '@shared/pro/champion-pool'
import {
  type GoalProgress,
  type GoalRequest,
  type Insights,
  PROGRESS_NAMESPACE,
  type ReviewBatch,
  type TrainingGoal,
  batchSchema,
  type goalChangeSchema
} from '@shared/pro/progress'
import type { z } from 'zod'

@Shard(ProgressRenderer.id)
export class ProgressRenderer {
  static id = 'pro-progress-renderer'
  constructor(@Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer) {}
  restoreStatus() {
    return this._ipc.call<string | null>('pro-storage-main', 'restoreStatus')
  }
  backup() {
    return this._ipc.call<boolean>('pro-storage-main', 'backup')
  }
  prepareRestore() {
    return this._ipc.call<{
      token: string
      version: number
      entries: number
      matches: number
    } | null>('pro-storage-main', 'prepareRestore')
  }
  restore(token: string) {
    return this._ipc.call<boolean>('pro-storage-main', 'restore', token)
  }
  insights(reportId: string, allChampions: boolean) {
    return this._ipc.call<Insights>(PROGRESS_NAMESPACE, 'insights', { reportId, allChampions })
  }
  createGoal(request: GoalRequest) {
    return this._ipc.call<TrainingGoal>(PROGRESS_NAMESPACE, 'createGoal', request)
  }
  changeGoal(request: z.infer<typeof goalChangeSchema>) {
    return this._ipc.call<TrainingGoal>(PROGRESS_NAMESPACE, 'changeGoal', request)
  }
  goals(page: number) {
    return this._ipc.call<{ items: TrainingGoal[]; total: number }>(
      PROGRESS_NAMESPACE,
      'goals',
      page
    )
  }
  progress(id: string) {
    return this._ipc.call<GoalProgress>(PROGRESS_NAMESPACE, 'progress', id)
  }
  candidates(player: PlayerIdentity, page: number) {
    return this._ipc.call<{ gameId: number; startedAt: number; championId: number }[]>(
      PROGRESS_NAMESPACE,
      'candidates',
      { ...player, page }
    )
  }
  preview(request: z.infer<typeof batchSchema>) {
    return this._ipc.call<ReviewBatch>(PROGRESS_NAMESPACE, 'preview', batchSchema.parse(request))
  }
  batches() {
    return this._ipc.call<ReviewBatch[]>(PROGRESS_NAMESPACE, 'batches')
  }
  runBatch(id: string) {
    return this._ipc.call<ReviewBatch>(PROGRESS_NAMESPACE, 'runBatch', id)
  }
  cancel() {
    return this._ipc.call<void>(PROGRESS_NAMESPACE, 'cancel')
  }
}
