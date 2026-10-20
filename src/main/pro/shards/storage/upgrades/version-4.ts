import type { EntityManager } from 'typeorm'

export async function initializeReviewsAndProfiles(manager: EntityManager) {
  await manager.query(`CREATE TABLE ReviewReports (
    id TEXT PRIMARY KEY, serverId TEXT NOT NULL, puuid TEXT NOT NULL, gameId INTEGER NOT NULL,
    championId INTEGER NOT NULL, startedAt INTEGER NOT NULL, createdAt INTEGER NOT NULL,
    digest TEXT NOT NULL, report TEXT NOT NULL,
    UNIQUE(serverId, puuid, gameId, digest)
  )`)
  await manager.query(
    'CREATE INDEX ReviewPlayerGame ON ReviewReports(serverId, puuid, gameId, createdAt)'
  )
  await manager.query(`CREATE TABLE ProfileSnapshots (
    id TEXT PRIMARY KEY, serverId TEXT NOT NULL, puuid TEXT NOT NULL,
    observedAt INTEGER NOT NULL, reason TEXT NOT NULL, summoner TEXT NOT NULL, ranked TEXT NOT NULL
  )`)
  await manager.query(
    'CREATE INDEX ProfilePlayerTime ON ProfileSnapshots(serverId, puuid, observedAt)'
  )
}
