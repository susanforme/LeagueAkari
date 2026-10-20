import type { EntityManager } from 'typeorm'

export async function initializeChampionPool(manager: EntityManager) {
  await manager.query(`CREATE TABLE PoolPlayers (
    serverId TEXT NOT NULL, puuid TEXT NOT NULL, name TEXT NOT NULL, updatedAt INTEGER NOT NULL,
    PRIMARY KEY (serverId, puuid)
  )`)
  await manager.query(`CREATE TABLE PoolMatches (
    serverId TEXT NOT NULL, puuid TEXT NOT NULL, gameId INTEGER NOT NULL,
    startedAt INTEGER NOT NULL, projection TEXT NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (serverId, puuid, gameId)
  )`)
  await manager.query(
    'CREATE INDEX PoolMatches_player_date ON PoolMatches(serverId, puuid, startedAt DESC, gameId DESC)'
  )
}
