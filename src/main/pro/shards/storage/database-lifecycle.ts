import type { DataSource } from 'typeorm'

import { initializeChampionPool } from './upgrades/version-1'
import { initializeResourceCache } from './upgrades/version-2'
import { initializeNotebooks } from './upgrades/version-3'
import { initializeReviewsAndProfiles } from './upgrades/version-4'
import { initializePracticeAndTraining } from './upgrades/version-5'
import { initializeExperience } from './upgrades/version-6'
import { initializePlayPlans } from './upgrades/version-7'
import { initializeLoadoutState } from './upgrades/version-8'
import { initializeNotebookFavorites } from './upgrades/version-9'
import { initializeHandbookWorkspace } from './upgrades/version-10'

export const PRO_DATABASE_VERSION = 10

export class NewerDatabaseVersionError extends Error {}

export async function initializeProDatabase(dataSource: DataSource) {
  await dataSource.initialize()
  await dataSource.query('PRAGMA busy_timeout = 5000')
  const [{ user_version: version }] = await dataSource.query('PRAGMA user_version')
  if (version > PRO_DATABASE_VERSION)
    throw new NewerDatabaseVersionError('Unsupported pro database version')
  if (version < PRO_DATABASE_VERSION) {
    await dataSource.transaction(async (manager) => {
      if (version === 0) await initializeChampionPool(manager)
      if (version < 2) await initializeResourceCache(manager)
      if (version < 3) await initializeNotebooks(manager)
      if (version < 4) await initializeReviewsAndProfiles(manager)
      if (version < 5) await initializePracticeAndTraining(manager)
      if (version < 6) await initializeExperience(manager)
      if (version < 7) await initializePlayPlans(manager)
      if (version < 8) await initializeLoadoutState(manager)
      if (version < 9) await initializeNotebookFavorites(manager)
      if (version < 10) await initializeHandbookWorkspace(manager)
      await manager.query(`PRAGMA user_version = ${PRO_DATABASE_VERSION}`)
    })
  }
}
