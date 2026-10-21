import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import { NotebookResourceLoader } from './resource-loader'

describe.runIf(!!process.versions.electron)('notebook local resources', () => {
  let db: DataSource, loader: NotebookResourceLoader
  const changed = vi.fn(),
    remote = vi.fn()
  beforeEach(async () => {
    db = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await initializeProDatabase(db)
    changed.mockReset()
    remote.mockReset()
    vi.stubGlobal('fetch', remote)
    loader = new NotebookResourceLoader(() => db, changed)
  })
  afterEach(async () => {
    await loader.dispose()
    await db.destroy()
    vi.unstubAllGlobals()
  })
  it('returns expired data immediately and retains it when background refresh fails', async () => {
    const local = { items: [], spells: [] }
    await db.query('INSERT INTO NotebookResources VALUES (?, ?, ?)', [
      'catalog:en',
      JSON.stringify(local),
      0
    ])
    let reject!: (error: Error) => void
    const response = new Promise((_, fail) => {
      reject = fail
    })
    remote.mockReturnValue(response)
    expect(await loader.catalog('en')).toEqual(local)
    expect(await loader.catalog('en')).toEqual(local)
    expect(remote).toHaveBeenCalledTimes(2)
    reject(new Error('offline'))
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith('catalog:en', true))
    const [row] = await db.query('SELECT data FROM NotebookResources WHERE key = ?', ['catalog:en'])
    expect(JSON.parse(row.data)).toEqual(local)
  })
})
