import type { EntityManager } from 'typeorm'

export async function initializePracticeAndTraining(manager: EntityManager) {
  await manager.query(`CREATE TABLE NotebookPractice (
    entryId TEXT PRIMARY KEY, revision INTEGER NOT NULL, sourceRevision INTEGER NOT NULL,
    state TEXT NOT NULL, notes TEXT NOT NULL, updatedAt INTEGER NOT NULL
  )`)
  await manager.query(`CREATE TABLE TrainingGoals (
    id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL
  )`)
  await manager.query(`CREATE TABLE ReviewBatches (
    id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL, payload TEXT NOT NULL
  )`)
  await manager.query(`CREATE TABLE BuildSyncRules (
    championId INTEGER NOT NULL, mapId INTEGER NOT NULL, entryId TEXT NOT NULL,
    enabled INTEGER NOT NULL, PRIMARY KEY(championId, mapId)
  )`)
  await manager.query(`CREATE TABLE BuildApplications (
    entryId TEXT NOT NULL, playerKey TEXT NOT NULL, uid TEXT NOT NULL,
    fingerprint TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(entryId, playerKey)
  )`)
}
