import type { EntityManager } from 'typeorm'

export async function initializeResourceCache(manager: EntityManager) {
  await manager.query(
    'CREATE TABLE PoolResources (locale TEXT PRIMARY KEY, catalog TEXT NOT NULL, updatedAt INTEGER NOT NULL)'
  )
}
