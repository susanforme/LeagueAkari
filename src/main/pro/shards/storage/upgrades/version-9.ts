import type { EntityManager } from 'typeorm'

export async function initializeNotebookFavorites(manager: EntityManager) {
  await manager.query('CREATE TABLE NotebookFavorites (championId INTEGER PRIMARY KEY)')
}
