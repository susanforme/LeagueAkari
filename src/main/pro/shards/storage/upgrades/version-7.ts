import type { EntityManager } from 'typeorm'

export async function initializePlayPlans(manager: EntityManager) {
  await manager.query(`CREATE TABLE ExperiencePlans (
    serverId TEXT NOT NULL, puuid TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(serverId, puuid)
  )`)
}
