import type { PlayerIdentity } from '@shared/pro/champion-pool'
import {
  type GoalProgress,
  type GoalRequest,
  type Insights,
  type ReviewBatch,
  type TrainingGoal,
  type batchSchema,
  type goalChangeSchema,
  metricIds
} from '@shared/pro/progress'
import type { ReviewReport } from '@shared/pro/review'
import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'
import type { z } from 'zod'

import type { ReviewMain } from '../review'
import { metricValue, quantile, reportScope, sample } from './metrics'

export class ProgressController {
  private _task: Promise<void> | null = null
  private _cancel = false
  private _disposed = false
  constructor(
    private readonly _database: () => DataSource,
    private readonly _reviews: Pick<ReviewMain, 'get' | 'open'>,
    private readonly _session: () => string,
    private readonly _onError: (error: unknown) => void
  ) {}
  private async _reports(
    player: PlayerIdentity,
    scope: TrainingGoal['scope'],
    direction: 'before' | 'after',
    timestamp: number
  ) {
    const database = this._database()
    const cte = `WITH latest AS (SELECT id,startedAt,ROW_NUMBER() OVER (PARTITION BY gameId ORDER BY createdAt DESC,rowid DESC) n FROM ReviewReports WHERE serverId=? AND puuid=?)`
    const time = `n=1 AND latest.startedAt ${direction === 'before' ? '<' : '>'} ?`
    const parameters = [player.serverId, player.puuid, timestamp]
    const [{ count }] = await database.query(
      `${cte} SELECT COUNT(*) count FROM latest WHERE ${time}`,
      parameters
    )
    if (scope.position === 'UNKNOWN' || !scope.patch)
      return { items: [] as ReviewReport[], count: count as number }
    // Filter and limit in SQLite so raw timelines from thousands of games never enter renderer/main memory.
    const rows = await database.query(
      `${cte} SELECT r.report FROM latest JOIN ReviewReports r ON r.id=latest.id WHERE ${time}
      AND json_extract(r.report,'$.analysis.metrics.queueId')=?
      AND json_extract(r.report,'$.analysis.metrics.position')=?
      AND json_extract(r.report,'$.analysis.metrics.patch')=?
      AND json_extract(r.report,'$.analysis.version')=?
      ${scope.championId === null ? '' : "AND json_extract(r.report,'$.analysis.metrics.championId')=?"}
      ORDER BY latest.startedAt DESC, r.id LIMIT 20`,
      [
        ...parameters,
        scope.queueId,
        scope.position,
        scope.patch,
        scope.version,
        ...(scope.championId === null ? [] : [scope.championId])
      ]
    )
    return {
      items: rows.map((row: { report: string }) => JSON.parse(row.report) as ReviewReport),
      count: count as number
    }
  }
  async insights(reportId: string, allChampions: boolean): Promise<Insights> {
    const current = await this._reviews.get(reportId),
      scope = reportScope(current, allChampions)
    const previous = await this._reports(
      current.player,
      scope,
      'before',
      current.analysis.metrics.startedAt
    )
    return {
      scanned: previous.count,
      truncated: false,
      metrics: metricIds.map((id) => {
        const eligible = previous.items
        const samples = eligible.flatMap((r) => {
          const value = sample(r, id)
          return value ? [value] : []
        })
        return {
          id,
          current: metricValue(current, id),
          median: quantile(
            samples.map((s) => s.value),
            0.5
          ),
          q1: quantile(
            samples.map((s) => s.value),
            0.25
          ),
          q3: quantile(
            samples.map((s) => s.value),
            0.75
          ),
          samples,
          excluded: previous.count - samples.length
        }
      })
    }
  }
  async createGoal(request: GoalRequest): Promise<TrainingGoal> {
    const report = await this._reviews.get(request.reportId)
    if (
      ['goldDeficit10', 'deathBeforeObjective'].includes(request.metric) &&
      (request.target < 0 || request.target > 1)
    )
      throw new Error('Invalid ratio')
    if (!['goldDiff10', 'goldDiff15'].includes(request.metric) && request.target < 0)
      throw new Error('Invalid target')
    const scope = reportScope(report, request.allChampions)
    if (scope.position === 'UNKNOWN' || !scope.patch) throw new Error('Scope unavailable')
    const baseline = (await this.insights(report.id, request.allChampions)).metrics.find(
      (m) => m.id === request.metric
    )!.samples
    const goal: TrainingGoal = {
      ...request,
      id: randomUUID(),
      revision: 1,
      createdAt: Date.now(),
      player: report.player,
      scope,
      baseline,
      state: baseline.length >= 5 ? 'active' : 'draft'
    }
    await this._database().query('INSERT INTO TrainingGoals VALUES (?, ?, ?)', [
      goal.id,
      goal.revision,
      JSON.stringify(goal)
    ])
    return goal
  }
  async goals(page: number) {
    const rows = await this._database().query(
      'SELECT payload FROM TrainingGoals ORDER BY rowid DESC LIMIT 30 OFFSET ?',
      [(page - 1) * 30]
    )
    const [{ total }] = await this._database().query('SELECT COUNT(*) total FROM TrainingGoals')
    return {
      total,
      items: rows.map((row: { payload: string }) => JSON.parse(row.payload) as TrainingGoal)
    }
  }
  async progress(id: string): Promise<GoalProgress> {
    const [row] = await this._database().query('SELECT payload FROM TrainingGoals WHERE id = ?', [
      id
    ])
    if (!row) throw new Error('Goal unavailable')
    const goal: TrainingGoal = JSON.parse(row.payload)
    const reports = await this._reports(goal.player, goal.scope, 'after', goal.createdAt)
    const candidates = reports.items
    const samples = candidates
      .flatMap((r) => {
        const value = sample(r, goal.metric)
        return value ? [value] : []
      })
      .reverse()
    return {
      goal,
      samples,
      excluded: candidates.length - samples.length,
      truncated: false
    }
  }
  async changeGoal(request: z.infer<typeof goalChangeSchema>) {
    const { goal } = await this.progress(request.id)
    if (goal.revision !== request.revision || ['completed', 'abandoned'].includes(goal.state))
      throw new Error('conflict')
    if (request.state === 'active' && goal.baseline.length < 5) {
      goal.baseline = (await this.insights(goal.reportId, goal.allChampions)).metrics.find(
        (m) => m.id === goal.metric
      )!.samples
      if (goal.baseline.length < 5) throw new Error('Need five baseline samples')
    }
    goal.state = request.state
    goal.revision++
    const database = this._database()
    const updated = await database.query(
      'UPDATE TrainingGoals SET revision=?,payload=? WHERE id=? AND revision=? RETURNING id',
      [goal.revision, JSON.stringify(goal), goal.id, request.revision]
    )
    if (updated.length !== 1) throw new Error('conflict')
    return goal
  }
  async candidates(player: PlayerIdentity, page: number) {
    return this._database().query(
      `SELECT gameId,startedAt,json_extract(projection,'$.championId') championId FROM PoolMatches
      WHERE serverId=? AND puuid=? ORDER BY startedAt DESC LIMIT 30 OFFSET ?`,
      [player.serverId, player.puuid, (page - 1) * 30]
    ) as Promise<{ gameId: number; startedAt: number; championId: number }[]>
  }
  async preview(request: z.infer<typeof batchSchema>): Promise<ReviewBatch> {
    const items: ReviewBatch['items'] = []
    for (const gameId of [...new Set(request.gameIds)]) {
      const local = await this._database().query(
        'SELECT gameId FROM PoolMatches WHERE serverId=? AND puuid=? AND gameId=?',
        [request.serverId, request.puuid, gameId]
      )
      if (!local.length) throw new Error('Match unavailable')
      const rows = await this._database().query(
        'SELECT report FROM ReviewReports WHERE serverId=? AND puuid=? AND gameId=? ORDER BY createdAt DESC LIMIT 1',
        [request.serverId, request.puuid, gameId]
      )
      const report: ReviewReport | undefined = rows[0] && JSON.parse(rows[0].report)
      items.push({
        gameId,
        state: report ? (report.details ? 'ready' : 'partial') : 'pending',
        reportId: report?.id
      })
    }
    const batch: ReviewBatch = {
      id: randomUUID(),
      player: { serverId: request.serverId, puuid: request.puuid },
      updatedAt: Date.now(),
      state: 'preview',
      items
    }
    await this._saveBatch(batch)
    return batch
  }
  private async _saveBatch(batch: ReviewBatch) {
    batch.updatedAt = Date.now()
    await this._database().query(
      'INSERT INTO ReviewBatches VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET updatedAt=excluded.updatedAt,payload=excluded.payload',
      [batch.id, batch.updatedAt, JSON.stringify(batch)]
    )
  }
  async batches() {
    return (
      await this._database().query(
        'SELECT payload FROM ReviewBatches ORDER BY updatedAt DESC LIMIT 30'
      )
    ).map((row: { payload: string }) => JSON.parse(row.payload) as ReviewBatch)
  }
  async initialize() {
    for (const batch of await this.batches())
      if (batch.state === 'running') {
        batch.state = 'interrupted'
        await this._saveBatch(batch)
      }
  }
  runBatch(id: string): Promise<ReviewBatch> {
    if (this._task || this._disposed) return Promise.reject(new Error('busy'))
    this._cancel = false
    const session = this._session()
    const start = (async () => {
      const [row] = await this._database().query('SELECT payload FROM ReviewBatches WHERE id=?', [
        id
      ])
      if (!row) throw new Error('Batch unavailable')
      if (this._disposed) throw new Error('disposed')
      const batch: ReviewBatch = JSON.parse(row.payload)
      batch.state = 'running'
      await this._saveBatch(batch)
      return batch
    })()
    this._task = start
      .then((batch) => this._run(batch, session))
      .catch(this._onError)
      .finally(() => {
        this._task = null
      })
    return start
  }
  private async _run(batch: ReviewBatch, session: string) {
    try {
      for (const item of batch.items) {
        if (this._cancel || this._disposed || session !== this._session()) break
        if (item.state === 'ready') continue
        try {
          const report = await this._reviews.open({
            ...batch.player,
            gameId: item.gameId,
            refresh: true
          })
          item.reportId = report.id
          item.state = report.details ? 'ready' : 'partial'
        } catch {
          item.state = 'failed'
        }
        await this._saveBatch(batch)
      }
      batch.state =
        this._disposed || session !== this._session()
          ? 'interrupted'
          : this._cancel
            ? 'cancelled'
            : batch.items.every((i) => i.state === 'ready')
              ? 'completed'
              : 'partial'
    } catch (error) {
      batch.state = 'interrupted'
      throw error
    } finally {
      await this._saveBatch(batch)
    }
  }
  cancel() {
    this._cancel = true
  }
  async dispose() {
    this._disposed = true
    this._cancel = true
    await this._task
  }
}
