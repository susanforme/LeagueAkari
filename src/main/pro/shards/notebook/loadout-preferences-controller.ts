import { type LoadoutPreferences, loadoutPreferencesSchema } from '@shared/pro/notebook/loadout'
import type { DataSource } from 'typeorm'
import { z } from 'zod'

export class LoadoutPreferencesController {
  value = loadoutPreferencesSchema.parse({})
  private _writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly _database: () => DataSource) {}
  async load() {
    const [row] = await this._database().query(
      "SELECT payload FROM NotebookLoadoutState WHERE key='preferences'"
    )
    if (row) this.value = loadoutPreferencesSchema.parse(JSON.parse(row.payload))
  }
  save(value: LoadoutPreferences) {
    const next = loadoutPreferencesSchema.parse(value)
    return this._write('preferences', next).then(() => {
      this.value = next
      return next
    })
  }
  private _write(key: string, value: unknown) {
    const task = this._writes
      .catch(() => {})
      .then(() =>
        this._database().query(
          'INSERT INTO NotebookLoadoutState VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload',
          [key, JSON.stringify(value)]
        )
      )
    this._writes = task
    return task
  }
  async choice(key: string): Promise<string | null> {
    const [row] = await this._database().query(
      'SELECT payload FROM NotebookLoadoutState WHERE key=?',
      [key]
    )
    return row ? z.string().uuid().parse(JSON.parse(row.payload)) : null
  }
  remember(key: string, entryId: string) {
    return this._write(key, entryId)
  }
  async dispose() {
    await this._writes.catch(() => {})
  }
}
