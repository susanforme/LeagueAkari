import { blankContent } from '@shared/pro/notebook'
import {
  blankPractice,
  championGuideSchema,
  savePracticePlanSchema,
  savePracticeSessionSchema
} from '@shared/pro/notebook/handbook'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import { NotebookController } from './notebook-controller'
import { PracticeController } from './practice-controller'

describe.runIf(!!process.versions.electron)('handbook practice workspace', () => {
  let directory: string
  let db: DataSource, practice: PracticeController, notebook: NotebookController
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akari-practice-'))
    db = new DataSource({ type: 'better-sqlite3', database: join(directory, 'pro.db') })
    await initializeProDatabase(db)
    practice = new PracticeController(() => db)
    notebook = new NotebookController(() => db)
  })
  afterEach(async () => {
    await practice.dispose()
    await notebook.dispose()
    await db.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  it('keeps explicit membership without entries and rejects stale overview edits', async () => {
    const input = championGuideSchema.parse({
      championId: 103,
      expectedRevision: 0,
      summary: 'My Ahri',
      position: 'MIDDLE'
    })
    await notebook.saveGuide(input)
    expect((await notebook.home()).champions).toMatchObject([
      { championId: 103, added: true, total: 0, positions: ['MIDDLE'] }
    ])
    await expect(notebook.saveGuide(input)).rejects.toThrow('conflict')
    expect((await notebook.guide(103))?.summary).toBe('My Ahri')
  })
  it('links a combo once, snapshots its steps, and preserves manual plan changes', async () => {
    const entry = await notebook.save({
      id: null,
      expectedRevision: 0,
      content: {
        ...blankContent(103, 'combo'),
        title: 'Charm trade',
        steps: [{ action: 'skill', entityId: 3, label: 'Charm', notes: 'Wait for last hit' }]
      }
    })
    const [first, second] = await Promise.all([
      practice.fromEntry(entry.id),
      practice.fromEntry(entry.id)
    ])
    expect(second.id).toBe(first.id)
    expect(first.content.steps).toEqual([{ title: 'Charm', notes: 'Wait for last hit' }])
    const changed = await practice.save({
      id: first.id,
      expectedRevision: first.revision,
      content: { ...first.content, notes: 'Keep my reflection' }
    })
    expect((await practice.fromEntry(entry.id)).content.notes).toBe('Keep my reflection')
    await expect(
      practice.save({ id: first.id, expectedRevision: 1, content: first.content })
    ).rejects.toThrow('conflict')
    expect((await practice.list(103, 1, 'Charm')).total).toBe(1)
    expect(changed.revision).toBe(2)
  })
  it('computes weighted hit rate from sessions, preserves missing metrics and deduplicates retries', async () => {
    const goal = {
      id: randomUUID(),
      label: 'Stationary target',
      target: 80,
      unit: 'percent' as const
    }
    const plan = await practice.save(
      savePracticePlanSchema.parse({
        id: null,
        expectedRevision: 0,
        content: { ...blankPractice(103, 'Q accuracy'), goals: [goal] }
      })
    )
    const request = savePracticeSessionSchema.parse({
      id: randomUUID(),
      planId: plan.id,
      expectedRevision: 1,
      practicedAt: Date.now(),
      durationSeconds: 600,
      attempts: 10,
      hits: 8,
      results: [{ goalId: goal.id, value: 80 }],
      notes: 'First session'
    })
    await practice.record(request)
    await practice.record(request)
    await practice.record({
      ...request,
      id: randomUUID(),
      durationSeconds: 300,
      attempts: 90,
      hits: 36,
      results: []
    })
    const result = await practice.sessions(plan.id, 30, 1)
    expect(result.total).toBe(2)
    expect(result.stats).toMatchObject({
      durationSeconds: 900,
      hitRate: 44,
      completion: 100,
      attempts: 100
    })
    expect(result.items.some((s) => s.completion === null)).toBe(true)
    const updated = await practice.save({
      id: plan.id,
      expectedRevision: 1,
      content: { ...plan.content, goals: [{ ...goal, target: 90 }] }
    })
    expect(
      (await practice.sessions(plan.id, 30, 1)).items.flatMap((s) => s.results).map((r) => r.target)
    ).toEqual([80])
    await expect(practice.record({ ...request, id: randomUUID() })).rejects.toThrow('conflict')
    await expect(
      practice.record({
        ...request,
        id: randomUUID(),
        expectedRevision: updated.revision,
        results: [{ goalId: randomUUID(), value: 5 }]
      })
    ).rejects.toThrow('Invalid goal')
    expect(savePracticeSessionSchema.safeParse({ ...request, hits: 11 }).success).toBe(false)
    expect(savePracticeSessionSchema.safeParse({ ...request, attempts: null }).success).toBe(false)
  })
  it('migrates existing practice without fabricating results and rolls back a failed migration', async () => {
    const entry = await notebook.save({
      id: null,
      expectedRevision: 0,
      content: { ...blankContent(103, 'note'), title: 'Trading' }
    })
    await notebook.savePractice({
      entryId: entry.id,
      expectedRevision: 0,
      sourceRevision: 1,
      state: 'practicing',
      notes: 'Keep this'
    })
    for (const table of ['HandbookChampions', 'PracticePlans', 'PracticeSessions'])
      await db.query(`DROP TABLE ${table}`)
    await db.query('PRAGMA user_version=9')
    await db.query('CREATE TABLE PracticeSessions(sentinel TEXT)')
    await db.query("INSERT INTO PracticeSessions VALUES ('keep')")
    await db.destroy()
    await expect(initializeProDatabase(db)).rejects.toThrow()
    expect(await db.query('SELECT * FROM PracticeSessions')).toEqual([{ sentinel: 'keep' }])
    expect(await db.query('PRAGMA user_version')).toEqual([{ user_version: 9 }])
    await db.query('DROP TABLE PracticeSessions')
    await db.destroy()
    await initializeProDatabase(db)
    const migrated = await practice.get(entry.id)
    expect(migrated.content).toMatchObject({
      title: 'Trading',
      notes: 'Keep this',
      state: 'practicing',
      goals: []
    })
    expect((await practice.sessions(entry.id, 30, 1)).stats).toMatchObject({
      sessions: 0,
      completion: null,
      hitRate: null
    })
  })
})
