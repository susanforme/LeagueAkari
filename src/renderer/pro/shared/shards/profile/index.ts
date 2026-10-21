import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import type { PlayerIdentity } from '@shared/pro/champion-pool'
import {
  PROFILE_NAMESPACE,
  type ProfileActivity,
  type ProfileMatches,
  type ProfileMatchesQuery,
  type ProfileSnapshot,
  type ProfileStatus,
  type ProfileTrend,
  type ProfileTrendQuery
} from '@shared/pro/profile'

@Shard(ProfileRenderer.id)
export class ProfileRenderer {
  static id = 'pro-profile-renderer'
  constructor(@Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer) {}
  status() {
    return this._ipc.call<ProfileStatus>(PROFILE_NAMESPACE, 'status')
  }
  capture() {
    return this._ipc.call<ProfileSnapshot>(PROFILE_NAMESPACE, 'capture')
  }
  players() {
    return this._ipc.call<ProfileSnapshot[]>(PROFILE_NAMESPACE, 'players')
  }
  activity(player: PlayerIdentity) {
    return this._ipc.call<ProfileActivity>(PROFILE_NAMESPACE, 'activity', player)
  }
  matches(query: ProfileMatchesQuery) {
    return this._ipc.call<ProfileMatches>(PROFILE_NAMESPACE, 'matches', query)
  }
  trend(query: ProfileTrendQuery) {
    return this._ipc.call<ProfileTrend>(PROFILE_NAMESPACE, 'trend', query)
  }
  history(player: PlayerIdentity, page: number) {
    return this._ipc.call<{ items: ProfileSnapshot[]; total: number }>(
      PROFILE_NAMESPACE,
      'history',
      { ...player, page }
    )
  }
}
