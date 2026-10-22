import {
  REVIEW_VERSION,
  type ReviewListItem,
  type ReviewReport,
  type ReviewRequest
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

  async list(page: number): Promise<{ items: ReviewListItem[]; total: number }> {
    const database = this._database()
    const [{ total }] = await database.query('SELECT COUNT(*) AS total FROM ReviewReports')
    const items = await database.query(
      'SELECT id, serverId, puuid, gameId, championId, startedAt, createdAt FROM ReviewReports ORDER BY createdAt DESC, id LIMIT 30 OFFSET ?',
      [(page - 1) * 30]
    )
    return { items, total }
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
