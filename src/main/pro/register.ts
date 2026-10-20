import type { AkariManager } from '@shared/akari-shard'

import { ChampionPoolMain } from './shards/champion-pool'
import { ExperienceMain } from './shards/experience'
import { NotebookMain } from './shards/notebook'
import { ProfileMain } from './shards/profile'
import { ProgressMain } from './shards/progress'
import { ReviewMain } from './shards/review'
import { ProStorageMain } from './shards/storage'

export function registerProShards(manager: AkariManager) {
  manager.use(ProStorageMain)
  manager.use(ChampionPoolMain)
  manager.use(NotebookMain)
  manager.use(ReviewMain)
  manager.use(ProfileMain)
  manager.use(ProgressMain)
  manager.use(ExperienceMain)
}
