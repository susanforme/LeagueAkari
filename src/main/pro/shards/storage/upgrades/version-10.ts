import type { EntityManager } from 'typeorm'

export async function initializeHandbookWorkspace(manager: EntityManager) {
  await manager.query(
    'CREATE TABLE HandbookChampions (championId INTEGER PRIMARY KEY, revision INTEGER NOT NULL, addedAt INTEGER NOT NULL, payload TEXT NOT NULL)'
  )
  await manager.query(
    'CREATE TABLE PracticePlans (id TEXT PRIMARY KEY, championId INTEGER NOT NULL, revision INTEGER NOT NULL, updatedAt INTEGER NOT NULL, payload TEXT NOT NULL)'
  )
  await manager.query(
    'CREATE TABLE PracticeSessions (id TEXT PRIMARY KEY, planId TEXT NOT NULL, practicedAt INTEGER NOT NULL, payload TEXT NOT NULL)'
  )
  await manager.query('CREATE INDEX PracticeSessions_plan ON PracticeSessions(planId,practicedAt)')
  await manager.query(`INSERT INTO PracticePlans SELECT p.entryId,e.championId,1,p.updatedAt,
    json_object('championId',e.championId,'sourceEntryId',p.entryId,'title',e.title,'category',e.kind,
    'difficulty','medium','description',e.text,'goals',json('[]'),'steps',json('[]'),'notes',p.notes,'state',p.state)
    FROM NotebookPractice p JOIN NotebookEntries e ON e.id=p.entryId WHERE e.deleted=0`)
}
