import type {
  ChangeNotebook,
  NotebookBundle,
  NotebookChampionSummary,
  NotebookEntry,
  NotebookPage,
  NotebookQuery,
  NotebookTransfer,
  PracticeEntry,
  SaveNotebook,
  SavePractice,
  TransferPreview
} from '@shared/pro/notebook'
import { contentSchema } from '@shared/pro/notebook'
import { randomUUID } from 'node:crypto'
import stringify from 'safe-stable-stringify'
import type { DataSource, EntityManager } from 'typeorm'

export class NotebookController {
  private _writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly _database: () => DataSource) {}

  async champions(): Promise<NotebookChampionSummary[]> {
    return this._database().query(`
      SELECT championId,
        SUM(deleted = 0) AS total,
        SUM(deleted = 1) AS trash,
        SUM(deleted = 0 AND pinned = 1) AS pinned,
        MAX(CASE WHEN deleted = 0 THEN updatedAt ELSE 0 END) AS updatedAt,
        SUM(deleted = 0 AND kind = 'note') AS note,
        SUM(deleted = 0 AND kind = 'combo') AS combo,
        SUM(deleted = 0 AND kind = 'matchup') AS matchup,
        SUM(deleted = 0 AND kind = 'build') AS build
      FROM NotebookEntries GROUP BY championId
    `)
  }

  async list(query: NotebookQuery): Promise<NotebookPage> {
    const conditions = ['deleted = ?']
    const values: (string | number)[] = [Number(query.deleted)]
    for (const key of ['championId', 'kind', 'opponentId'] as const) {
      if (query[key] !== null) {
        conditions.push(`${key} = ?`)
        values.push(query[key])
      }
    }
    if (query.publicOpponents !== undefined) {
      conditions.push(
        query.publicOpponents.length
          ? `(opponentId IS NULL OR opponentId IN (${query.publicOpponents.map(() => '?').join(',')}))`
          : 'opponentId IS NULL'
      )
      values.push(...query.publicOpponents)
    }
    if (query.search) {
      conditions.push(
        "(title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(content, '$.tags') WHERE value LIKE ? ESCAPE '\\'))"
      )
      const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
      values.push(search, search, search)
    }
    if (query.targetPatch && query.reviewState && query.reviewState !== 'all') {
      const patch = "json_extract(content, '$.confirmedPatch')"
      if (query.reviewState === 'unmarked') conditions.push(`${patch} IS NULL`)
      else {
        conditions.push(`${patch} ${query.reviewState === 'confirmed' ? '=' : '!='} ?`)
        values.push(query.targetPatch)
      }
    }
    if (query.reportId) {
      conditions.push("json_extract(content, '$.source.reportId') = ?")
      values.push(query.reportId)
    }
    if (query.buildMapId !== undefined) {
      conditions.push("COALESCE(json_extract(content, '$.mapId'), 11) = ?")
      values.push(query.buildMapId)
    }
    if (query.buildPosition) {
      conditions.push(
        "(json_extract(content, '$.position') IS NULL OR json_extract(content, '$.position') = ?)"
      )
      values.push(query.buildPosition)
    }
    const where = conditions.join(' AND ')
    const db = this._database()
    const [{ total }] = await db.query(
      `SELECT COUNT(*) AS total FROM NotebookEntries WHERE ${where}`,
      values
    )
    const rows = await db.query(
      `SELECT * FROM NotebookEntries WHERE ${where} ORDER BY pinned DESC, updatedAt DESC, id LIMIT 30 OFFSET ?`,
      [...values, (query.page - 1) * 30]
    )
    return { total, items: rows.map(this._decode) }
  }

  async history(id: string, page: number): Promise<NotebookPage> {
    const db = this._database()
    const [{ total }] = await db.query(
      'SELECT COUNT(*) AS total FROM NotebookRevisions WHERE entryId = ?',
      [id]
    )
    const rows: { snapshot: string }[] = await db.query(
      'SELECT snapshot FROM NotebookRevisions WHERE entryId = ? ORDER BY revision DESC LIMIT 20 OFFSET ?',
      [id, (page - 1) * 20]
    )
    return { total, items: rows.map((row) => JSON.parse(row.snapshot)) }
  }

  save(request: SaveNotebook) {
    return this._write(async (manager) => {
      for (const id of request.content.links ?? []) {
        if (id === request.id) throw new Error('Self link')
        const linked = await this._get(manager, id)
        if (linked.deleted) throw new Error('Linked entry unavailable')
      }
      const source = request.content.source
      if (source?.reportId) {
        const rows = await manager.query('SELECT report FROM ReviewReports WHERE id = ?', [
          source.reportId
        ])
        if (!rows.length) throw new Error('Report unavailable')
        const report = JSON.parse(rows[0].report)
        if (
          report.player.serverId !== source.serverId ||
          report.player.puuid !== source.puuid ||
          report.summary.gameId !== source.gameId ||
          report.analysis.metrics.championId !== request.content.championId ||
          (source.timestamp !== undefined && source.timestamp > report.analysis.duration) ||
          (source.evidenceId &&
            !report.analysis.events.some(
              (event: { id: string; timestamp: number }) =>
                event.id === source.evidenceId && event.timestamp === source.timestamp
            ))
        )
          throw new Error('Invalid review evidence')
      }
      const previous = request.id ? await this._get(manager, request.id) : null
      if (request.expectedRevision !== (previous?.revision ?? 0) || previous?.deleted)
        throw new Error('conflict')
      if (
        previous &&
        (previous.content.championId !== request.content.championId ||
          previous.content.kind !== request.content.kind)
      )
        throw new Error('Invalid entry identity')
      const entry: NotebookEntry = {
        id: previous?.id ?? randomUUID(),
        revision: (previous?.revision ?? 0) + 1,
        content: request.content,
        deleted: false,
        updatedAt: Date.now()
      }
      await this._persist(manager, entry)
      return entry
    })
  }

  change(request: ChangeNotebook) {
    return this._write(async (manager) => {
      const entry = await this._get(manager, request.id)
      if (entry.revision !== request.expectedRevision) throw new Error('conflict')
      if (request.action === 'restore') {
        const [row] = await manager.query(
          'SELECT snapshot FROM NotebookRevisions WHERE entryId = ? AND revision = ?',
          [entry.id, request.revision]
        )
        if (!row) throw new Error('History unavailable')
        entry.content = (JSON.parse(row.snapshot) as NotebookEntry).content
        entry.deleted = false
      } else if (request.action === 'pin') {
        entry.content.pinned = !entry.content.pinned
      } else {
        entry.deleted = request.action === 'trash'
      }
      entry.revision++
      entry.updatedAt = Date.now()
      await this._persist(manager, entry)
      return entry
    })
  }

  async get(id: string) {
    return this._get(this._database().manager, id)
  }

  async exportBundle(championId: number | null): Promise<NotebookBundle> {
    const rows = await this._database().query(
      'SELECT * FROM NotebookEntries WHERE deleted = 0' +
        (championId ? ' AND championId = ?' : '') +
        ' ORDER BY id LIMIT 1001',
      championId ? [championId] : []
    )
    if (rows.length > 1000) throw new Error('Select a champion to export fewer entries')
    return {
      format: 'akari-notebook',
      version: 1,
      entries: rows.map((row: any) => {
        const entry = this._decode(row)
        return { id: entry.id, content: { ...entry.content, source: null } }
      })
    }
  }

  transfer(request: NotebookTransfer): Promise<TransferPreview> {
    return this._write(async (manager) => {
      const sourceIds = new Set(request.bundle.entries.map((entry) => entry.id))
      if (sourceIds.size !== request.bundle.entries.length) throw new Error('Duplicate source IDs')
      if (
        new Set(request.replacements.map((entry) => entry.sourceId)).size !==
          request.replacements.length ||
        new Set(request.replacements.map((entry) => entry.targetId)).size !==
          request.replacements.length ||
        request.replacements.some((entry) => !sourceIds.has(entry.sourceId))
      )
        throw new Error('Invalid replacements')
      const existing: NotebookEntry[] = (
        await manager.query('SELECT * FROM NotebookEntries WHERE deleted = 0')
      ).map(this._decode)
      const baseFingerprint = (content: NotebookEntry['content']) =>
        stringify({ ...contentSchema.parse(content), source: null, links: [] })
      const fingerprint = (
        content: NotebookEntry['content'],
        pool: { id: string; content: NotebookEntry['content'] }[]
      ) =>
        stringify({
          body: baseFingerprint(content),
          links: (content.links ?? [])
            .flatMap((id) => {
              const linked = pool.find((e) => e.id === id)
              return linked ? [baseFingerprint(linked.content)] : []
            })
            .sort()
        })
      const identities = new Map<string, string>()
      const planned: NotebookEntry[] = []
      const result: TransferPreview = { added: 0, duplicates: 0, missingLinks: 0, conflicts: [] }
      for (const incoming of request.bundle.entries) {
        const content = { ...contentSchema.parse(incoming.content), source: null }
        const replacement = request.replacements.find((entry) => entry.sourceId === incoming.id)
        const previous = replacement
          ? existing.find((entry) => entry.id === replacement.targetId)
          : undefined
        if (replacement && (!previous || previous.revision !== replacement.expectedRevision))
          throw new Error('conflict')
        if (
          previous &&
          (previous.content.championId !== content.championId ||
            previous.content.kind !== content.kind)
        )
          throw new Error('Invalid replacement identity')
        const duplicate =
          !replacement &&
          [...existing, ...planned].find(
            (entry) =>
              fingerprint(entry.content, [...existing, ...request.bundle.entries, ...planned]) ===
              fingerprint(content, request.bundle.entries)
          )
        if (duplicate) {
          identities.set(incoming.id, duplicate.id)
          result.duplicates++
          continue
        }
        for (const conflict of existing.filter(
          (entry) =>
            entry.content.championId === content.championId &&
            entry.content.kind === content.kind &&
            entry.content.title === content.title
        ))
          result.conflicts.push({
            sourceId: incoming.id,
            targetId: conflict.id,
            title: content.title,
            revision: conflict.revision
          })
        const entry: NotebookEntry = {
          id: previous?.id ?? randomUUID(),
          revision: (previous?.revision ?? 0) + 1,
          content,
          deleted: false,
          updatedAt: Date.now()
        }
        identities.set(incoming.id, entry.id)
        planned.push(entry)
        if (!previous) result.added++
      }
      for (const entry of planned) {
        entry.content.links = (entry.content.links ?? []).flatMap((id) => {
          const mapped = identities.get(id)
          if (!mapped) {
            result.missingLinks++
            return []
          }
          return mapped === entry.id ? [] : [mapped]
        })
        if (request.commit) await this._persist(manager, entry)
      }
      return result
    })
  }

  async practices(championId: number | null): Promise<PracticeEntry[]> {
    const rows = await this._database().query(
      `SELECT p.* FROM NotebookPractice p JOIN NotebookEntries e ON e.id = p.entryId
       WHERE e.deleted = 0 ${championId ? 'AND e.championId = ?' : ''} ORDER BY p.updatedAt DESC LIMIT 1000`,
      championId ? [championId] : []
    )
    return Promise.all(
      rows.map(async (row: Omit<PracticeEntry, 'entry'>) => ({
        ...row,
        entry: await this.get(row.entryId)
      }))
    )
  }

  savePractice(request: SavePractice) {
    return this._write(async (manager) => {
      const entry = await this._get(manager, request.entryId)
      if (entry.deleted || request.sourceRevision !== entry.revision) throw new Error('conflict')
      const [previous] = await manager.query(
        'SELECT revision FROM NotebookPractice WHERE entryId = ?',
        [entry.id]
      )
      if ((previous?.revision ?? 0) !== request.expectedRevision) throw new Error('conflict')
      await manager.query(
        `INSERT INTO NotebookPractice VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(entryId) DO UPDATE SET revision=excluded.revision, sourceRevision=excluded.sourceRevision,
        state=excluded.state, notes=excluded.notes, updatedAt=excluded.updatedAt`,
        [
          entry.id,
          request.expectedRevision + 1,
          request.sourceRevision,
          request.state,
          request.notes,
          Date.now()
        ]
      )
    })
  }

  async dispose() {
    await this._writes
  }

  private _write<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    // One SQLite connection cannot safely interleave async transactions.
    const result = this._writes.then(() => this._database().transaction(operation))
    this._writes = result.catch(() => {})
    return result
  }
  private async _get(manager: EntityManager, id: string) {
    const [row] = await manager.query('SELECT * FROM NotebookEntries WHERE id = ?', [id])
    if (!row) throw new Error('Entry unavailable')
    return this._decode(row)
  }
  private _decode(row: {
    id: string
    revision: number
    content: string
    deleted: number
    updatedAt: number
  }): NotebookEntry {
    return {
      id: row.id,
      revision: row.revision,
      content: contentSchema.parse(JSON.parse(row.content)),
      deleted: !!row.deleted,
      updatedAt: row.updatedAt
    }
  }
  private async _persist(manager: EntityManager, entry: NotebookEntry) {
    const c = entry.content
    await manager.query(
      `INSERT INTO NotebookEntries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, text=excluded.text, pinned=excluded.pinned,
      opponentId=excluded.opponentId, revision=excluded.revision, deleted=excluded.deleted,
      content=excluded.content, updatedAt=excluded.updatedAt`,
      [
        entry.id,
        c.championId,
        c.kind,
        c.title,
        c.text,
        Number(c.pinned),
        c.opponentId,
        entry.revision,
        Number(entry.deleted),
        JSON.stringify(c),
        entry.updatedAt
      ]
    )
    await manager.query('INSERT INTO NotebookRevisions VALUES (?, ?, ?)', [
      entry.id,
      entry.revision,
      JSON.stringify(entry)
    ])
  }
}
