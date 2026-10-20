import type { ChampSelectSession } from '@shared/types/league-client/champ-select'

export function quickContext(
  connected: boolean,
  phase: string | null,
  session: ChampSelectSession | null
) {
  if (!connected || phase !== 'ChampSelect' || !session || session.isSpectating) return null
  const self = session.myTeam.find((member) => member.cellId === session.localPlayerCellId)
  const championId = self?.championId || self?.championPickIntent
  if (!championId) return null
  return {
    championId,
    // Opponent hover intents are not public picks.
    opponents: [
      ...new Set(session.theirTeam.map((member) => member.championId).filter((id) => id > 0))
    ].slice(0, 5),
    sessionId: `${session.id}:${session.gameId}`
  }
}
