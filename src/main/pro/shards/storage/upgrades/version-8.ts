import type { EntityManager } from 'typeorm'

export async function initializeLoadoutState(manager: EntityManager) {
  await manager.query(
    'CREATE TABLE NotebookLoadoutState (key TEXT PRIMARY KEY, payload TEXT NOT NULL)'
  )
}
