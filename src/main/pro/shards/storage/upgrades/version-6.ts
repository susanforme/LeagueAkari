import type { EntityManager } from 'typeorm'

export async function initializeExperience(manager: EntityManager) {
  await manager.query(
    'CREATE TABLE ExperiencePreferences (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)'
  )
  await manager.query(
    'CREATE TABLE ExperienceWorkspaces (accountKey TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL, payload TEXT NOT NULL)'
  )
  await manager.query(
    'CREATE TABLE ExperienceScenes (name TEXT PRIMARY KEY, payload TEXT NOT NULL)'
  )
}
