import type { EntityManager } from 'typeorm'

export async function initializeNotebooks(manager: EntityManager) {
  await manager.query(`CREATE TABLE NotebookEntries (
    id TEXT PRIMARY KEY, championId INTEGER NOT NULL, kind TEXT NOT NULL,
    title TEXT NOT NULL, text TEXT NOT NULL, pinned INTEGER NOT NULL,
    opponentId INTEGER, revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL, updatedAt INTEGER NOT NULL
  )`)
  await manager.query(
    'CREATE INDEX NotebookChampion ON NotebookEntries(championId, deleted, pinned, updatedAt)'
  )
  await manager.query(`CREATE TABLE NotebookRevisions (
    entryId TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL,
    PRIMARY KEY(entryId, revision)
  )`)
  await manager.query(`CREATE TABLE NotebookResources (
    key TEXT PRIMARY KEY, data TEXT NOT NULL, updatedAt INTEGER NOT NULL
  )`)
}
