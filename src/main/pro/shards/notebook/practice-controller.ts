import { contentSchema } from '@shared/pro/notebook'
import {
  type PracticePlan,
  type PracticeSession,
  type PracticeSessionPage,
  type SavePracticePlan,
  type SavePracticeSession,
  blankPractice,
  practicePlanContentSchema,
  sessionCompletion
} from '@shared/pro/notebook/handbook'
import { randomUUID } from 'node:crypto'
import type { DataSource, EntityManager } from 'typeorm'

export class PracticeController {
  private _writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly _database: () => DataSource) {}
  async list(championId: number | null, page: number, search: string) {
    const condition = `NOT EXISTS(SELECT 1 FROM NotebookEntries e WHERE e.id=json_extract(payload,'$.sourceEntryId') AND e.deleted=1) AND (? IS NULL OR championId=?) AND json_extract(payload,'$.title') LIKE ? ESCAPE '\\'`
    const values = [championId, championId, `%${search.replace(/[\\%_]/g, '\\$&')}%`]
    const [{ total }] = await this._database().query(
      `SELECT COUNT(*) total FROM PracticePlans WHERE ${condition}`,
      values
    )
    const rows = await this._database().query(
      `SELECT *, (SELECT json_extract(s.payload,'$.completion') FROM PracticeSessions s WHERE s.planId=PracticePlans.id ORDER BY s.practicedAt DESC,s.id LIMIT 1) completion FROM PracticePlans WHERE ${condition} ORDER BY updatedAt DESC,id LIMIT 30 OFFSET ?`,
      [...values, (page - 1) * 30]
    )
    return { total, items: rows.map(this._decode) as PracticePlan[] }
  }
  async get(id: string): Promise<PracticePlan> {
    const [row] = await this._database().query('SELECT * FROM PracticePlans WHERE id=?', [id])
    if (!row) throw new Error('Practice unavailable')
    return this._decode(row)
  }
  fromEntry(entryId: string) {
    return this._write(async (manager) => {
      const [existing] = await manager.query(
        "SELECT * FROM PracticePlans WHERE json_extract(payload,'$.sourceEntryId')=? ORDER BY updatedAt DESC LIMIT 1",
        [entryId]
      )
      if (existing) return this._decode(existing)
      const [row] = await manager.query(
        'SELECT content FROM NotebookEntries WHERE id=? AND deleted=0',
        [entryId]
      )
      if (!row) throw new Error('Source unavailable')
      const entry = contentSchema.parse(JSON.parse(row.content))
      const content = {
        ...blankPractice(entry.championId, entry.title),
        sourceEntryId: entryId,
        description: entry.text,
        category: entry.kind,
        difficulty: entry.difficulty ?? ('medium' as const),
        steps: entry.steps.map((s) => ({
          title:
            s.label ||
            (s.action === 'skill' ? ['Q', 'W', 'E', 'R'][(s.entityId ?? 1) - 1] : s.action),
          notes: s.notes ?? ''
        }))
      }
      const plan = {
        id: entryId,
        revision: 1,
        updatedAt: Date.now(),
        content: practicePlanContentSchema.parse(content)
      }
      await manager.query('INSERT INTO PracticePlans VALUES (?,?,?,?,?)', [
        plan.id,
        entry.championId,
        plan.revision,
        plan.updatedAt,
        JSON.stringify(plan.content)
      ])
      return plan
    })
  }
  save(request: SavePracticePlan) {
    return this._write(async (manager) => {
      const [previous] = request.id
        ? await manager.query('SELECT * FROM PracticePlans WHERE id=?', [request.id])
        : []
      if ((previous?.revision ?? 0) !== request.expectedRevision || (request.id && !previous))
        throw new Error('conflict')
      if (previous && previous.championId !== request.content.championId)
        throw new Error('conflict')
      if (request.content.sourceEntryId) {
        const [entry] = await manager.query(
          'SELECT championId,deleted FROM NotebookEntries WHERE id=?',
          [request.content.sourceEntryId]
        )
        if (!entry || entry.deleted || entry.championId !== request.content.championId)
          throw new Error('Source unavailable')
      }
      const plan: PracticePlan = {
        id: request.id ?? randomUUID(),
        revision: request.expectedRevision + 1,
        updatedAt: Date.now(),
        content: request.content
      }
      await manager.query(
        'INSERT INTO PracticePlans VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updatedAt=excluded.updatedAt,payload=excluded.payload',
        [
          plan.id,
          plan.content.championId,
          plan.revision,
          plan.updatedAt,
          JSON.stringify(plan.content)
        ]
      )
      await manager.query('INSERT OR IGNORE INTO HandbookChampions VALUES (?,?,?,?)', [
        plan.content.championId,
        1,
        plan.updatedAt,
        JSON.stringify({
          position: null,
          summary: '',
          strengths: '',
          weaknesses: '',
          playstyle: ''
        })
      ])
      return plan
    })
  }
  record(request: SavePracticeSession) {
    return this._write(async (manager) => {
      const [existing] = await manager.query('SELECT payload FROM PracticeSessions WHERE id=?', [
        request.id
      ])
      if (existing) {
        const session: PracticeSession = JSON.parse(existing.payload)
        if (session.planId !== request.planId) throw new Error('conflict')
        return session
      }
      const [row] = await manager.query('SELECT * FROM PracticePlans WHERE id=?', [request.planId])
      if (!row || row.revision !== request.expectedRevision) throw new Error('conflict')
      if (request.practicedAt > Date.now() + 60000) throw new Error('Future session')
      const plan = this._decode(row)
      const results = request.results.map((result) => {
        const goal = plan.content.goals.find((g) => g.id === result.goalId)
        if (!goal || (goal.unit === 'percent' && result.value > 100))
          throw new Error('Invalid goal result')
        return {
          goalId: goal.id,
          label: goal.label,
          target: goal.target,
          unit: goal.unit,
          value: result.value
        }
      })
      const { expectedRevision: _, ...input } = request
      const session: PracticeSession = {
        ...input,
        results,
        completion: sessionCompletion(results, plan.content.goals.length)
      }
      await manager.query('INSERT INTO PracticeSessions VALUES (?,?,?,?)', [
        session.id,
        session.planId,
        session.practicedAt,
        JSON.stringify(session)
      ])
      return session
    })
  }
  async sessions(planId: string, days: number, page: number): Promise<PracticeSessionPage> {
    const values = [planId, Date.now() - days * 86400000]
    const [stats] = await this._database().query(
      `SELECT COUNT(*) sessions, COALESCE(SUM(json_extract(payload,'$.durationSeconds')),0) durationSeconds,
      AVG(json_extract(payload,'$.completion')) completion,
      CASE WHEN SUM(json_extract(payload,'$.attempts'))>0 THEN 100.0*SUM(json_extract(payload,'$.hits'))/SUM(json_extract(payload,'$.attempts')) ELSE NULL END hitRate,
      COALESCE(SUM(json_extract(payload,'$.attempts')),0) attempts
      FROM PracticeSessions WHERE planId=? AND practicedAt>=?`,
      values
    )
    const rows = await this._database().query(
      'SELECT payload FROM PracticeSessions WHERE planId=? AND practicedAt>=? ORDER BY practicedAt DESC,id LIMIT 20 OFFSET ?',
      [...values, (page - 1) * 20]
    )
    return {
      total: stats.sessions,
      stats,
      items: rows.map((r: { payload: string }) => JSON.parse(r.payload))
    }
  }
  async dispose() {
    await this._writes
  }
  private _decode(row: {
    id: string
    revision: number
    updatedAt: number
    payload: string
    completion?: number | null
  }): PracticePlan {
    return {
      completion: row.completion ?? null,
      id: row.id,
      revision: row.revision,
      updatedAt: row.updatedAt,
      content: practicePlanContentSchema.parse(JSON.parse(row.payload))
    }
  }
  private _write<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    const result = this._writes.then(() => this._database().transaction(operation))
    this._writes = result.catch(() => {})
    return result
  }
}
