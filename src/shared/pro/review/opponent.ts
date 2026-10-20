import type { MatchBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import type { toParticipants } from '@shared/data-adapter/match-history/participants'

export function findOpponent(
  basic: MatchBasicInfo,
  participants: ReturnType<typeof toParticipants>,
  puuid: string
) {
  const own = participants.filter((p) => p.puuid === puuid)
  if (
    basic.mapId !== 11 ||
    basic.gameMode !== 'CLASSIC' ||
    own.length !== 1 ||
    new Set(participants.map((p) => p.participantId)).size !== participants.length
  )
    return null
  const player = own[0]
  if (!['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(player.position ?? '')) return null
  const allies = participants.filter(
    (p) => p.teamId === player.teamId && p.position === player.position
  )
  const enemies = participants.filter(
    (p) => p.teamId !== player.teamId && p.position === player.position
  )
  return allies.length === 1 && enemies.length === 1 ? enemies[0] : null
}
