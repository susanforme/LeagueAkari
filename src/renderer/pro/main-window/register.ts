import type { createManager } from '@renderer-shared/shards'

import { ChampionPoolRenderer } from '../shared/shards/champion-pool'
import { ExperienceRenderer } from '../shared/shards/experience'
import { NotebookRenderer } from '../shared/shards/notebook'
import { ProfileRenderer } from '../shared/shards/profile'
import { ProgressRenderer } from '../shared/shards/progress'
import { ReviewRenderer } from '../shared/shards/review'

export function registerProShards(manager: ReturnType<typeof createManager>) {
  manager.use(ChampionPoolRenderer)
  manager.use(NotebookRenderer)
  manager.use(ReviewRenderer)
  manager.use(ProfileRenderer)
  manager.use(ProgressRenderer)
  manager.use(ExperienceRenderer)
}
