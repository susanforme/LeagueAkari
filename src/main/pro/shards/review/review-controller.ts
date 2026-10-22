import {
  REVIEW_PAGE_SIZE,
  REVIEW_VERSION,
  type ReviewLibrary,
  type ReviewListQuery,
  type ReviewRemoveResult,
  type ReviewReport,
  type ReviewRequest,
  reviewListSchema
} from '@shared/pro/review'
import { createHash, randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'

import type { ChampionPoolMain } from '../champion-pool'
import { analyzeMatch } from './analysis'

export class ReviewController {
  private readonly _pending = new Map<string, Promise<ReviewReport>>()
  private _disposed = false
  constructor(
    private readonly _database: () => DataSource,
    private readonly _pool: Pick<ChampionPoolMain, 'match' | 'details'>
  ) {}

  async list(input: ReviewListQuery | number): Promise<ReviewLibrary> {
    const query = typeof input === 'number' ? reviewListSchema.parse({ page: input }) : input
    const database = this._database()
    const conditions: string[] = []
    const values: (number | string)[] = []
    if (query.search) {
      const champions = query.searchChampionIds
      conditions.push(
        `(instr(CAST(gameId AS TEXT), ?) > 0 OR instr(lower(serverId), ?) > 0${
          champions.length ? ` OR championId IN (${champions.map(() => '?').join(',')})` : ''
        })`
      )
      values.push(query.search.toLowerCase(), query.search.toLowerCase(), ...champions)
    }
    if (query.championId !== null) {
      conditions.push('championId = ?')
      values.push(query.championId)
    }
    if (query.queueId !== null) {
      conditions.push("json_extract(report, '$.analysis.metrics.queueId') = ?")
      values.push(query.queueId)
    }
    if (query.from !== null) {
      conditions.push('startedAt >= ?')
      values.push(query.from)
    }
    if (query.to !== null) {
      conditions.push('startedAt < ?')
      values.push(query.to)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const order = {
      matchNewest: 'startedAt DESC',
      matchOldest: 'startedAt ASC',
      savedNewest: 'createdAt DESC',
      savedOldest: 'createdAt ASC'
    }[query.sort]
    const [{ total }] = await database.query(
      `SELECT COUNT(*) AS total FROM ReviewReports ${where}`,
      values
    )
    const rows = await database.query(
      `SELECT id, serverId, puuid, gameId, championId, startedAt, createdAt,
       json_extract(report, '$.summary') AS summary FROM ReviewReports ${where}
       ORDER BY ${order}, id LIMIT ? OFFSET ?`,
      [...values, REVIEW_PAGE_SIZE, (query.page - 1) * REVIEW_PAGE_SIZE]
    )
    const champions = await database.query(
      'SELECT championId, COUNT(*) AS count FROM ReviewReports GROUP BY championId ORDER BY count DESC, championId'
    )
    const queues = await database.query(
      "SELECT DISTINCT json_extract(report, '$.analysis.metrics.queueId') AS queueId FROM ReviewReports ORDER BY queueId"
    )
    return {
      items: rows.map((row) => ({ ...row, summary: JSON.parse(row.summary) })),
      total,
      saved: champions.reduce((sum, item) => sum + item.count, 0),
      champions,
      queueIds: queues.map((item) => item.queueId)
    }
  }

  async remove(id: string): Promise<ReviewRemoveResult> {
    return this._database().transaction(async (manager) => {
      // Keep evidence available for both current records and restorable notebook revisions.
      for (const [table, column] of [
        ['NotebookEntries', 'content'],
        ['NotebookRevisions', 'snapshot'],
        ['TrainingGoals', 'payload'],
        ['ReviewBatches', 'payload']
      ]) {
        const references = await manager.query(
          `SELECT 1 FROM ${table}, json_tree(${column}) WHERE json_tree.key = 'reportId' AND json_tree.value = ? LIMIT 1`,
          [id]
        )
        if (references.length) return 'referenced'
      }
      await manager.query('DELETE FROM ReviewReports WHERE id = ?', [id])
      return 'removed'
    })
  }

  async get(id: string): Promise<ReviewReport> {
    const rows = await this._database().query('SELECT report FROM ReviewReports WHERE id = ?', [id])
    if (!rows.length) throw new Error('Report unavailable')
    return JSON.parse(rows[0].report)
  }

  open(request: ReviewRequest): Promise<ReviewReport> {
    if (this._disposed) return Promise.reject(new Error('Review service disposed'))
    const key = JSON.stringify(request)
    const pending = this._pending.get(key)
    if (pending) return pending
    const task = this._open(request).finally(() => this._pending.delete(key))
    this._pending.set(key, task)
    return task
  }

  private async _open(request: ReviewRequest): Promise<ReviewReport> {
    const { serverId, puuid, gameId } = request
    const database = this._database()
    const local = await database.query(
      'SELECT report FROM ReviewReports WHERE serverId = ? AND puuid = ? AND gameId = ? ORDER BY createdAt DESC LIMIT 1',
      [serverId, puuid, gameId]
    )
    if (local.length && !request.refresh) return JSON.parse(local[0].report)
    const summary = await this._pool.match(request, gameId)
    if (!summary) throw new Error('Match not saved locally')
    let details: ReviewReport['details'] = null
    try {
      details = await this._pool.details(request, gameId, request.refresh)
    } catch (error) {
      // Keep an existing report intact when refreshing its timeline fails.
      if (local.length) throw error
    }
    if (this._disposed) throw new Error('Review service disposed')
    const analysis = analyzeMatch(summary, details, puuid)
    const digest = createHash('sha256')
      .update(JSON.stringify({ summary, details, version: REVIEW_VERSION }))
      .digest('hex')
    const report: ReviewReport = {
      id: randomUUID(),
      player: { serverId, puuid },
      createdAt: Date.now(),
      summary,
      details,
      analysis
    }
    await database.query(
      `INSERT OR IGNORE INTO ReviewReports
       (id, serverId, puuid, gameId, championId, startedAt, createdAt, digest, report)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report.id,
        serverId,
        puuid,
        gameId,
        analysis.metrics.championId,
        analysis.metrics.startedAt,
        report.createdAt,
        digest,
        JSON.stringify(report)
      ]
    )
    const [stored] = await database.query(
      'SELECT report FROM ReviewReports WHERE serverId = ? AND puuid = ? AND gameId = ? AND digest = ?',
      [serverId, puuid, gameId, digest]
    )
    return JSON.parse(stored.report)
  }

  async dispose() {
    this._disposed = true
    await Promise.allSettled(this._pending.values())
  }
}
