import { toBasicInfo } from '../../data-adapter/match-history/match-basic'
import type { CachedGame, Partner, SessionSummary } from './index'

// A break of two hours ends a continuous play session; historical imports use match times.
export function sessionSummary(games: CachedGame[]): SessionSummary | null {
  const sorted = [...games].sort((a, b) => b.match.startedAt - a.match.startedAt)
  if (!sorted.length) return null
  const included = [sorted[0]]
  for (const game of sorted.slice(1)) {
    const end = game.match.startedAt + Math.max(0, toBasicInfo(game.summary).gameDuration) * 1000
    if (included.at(-1)!.match.startedAt - end > 2 * 60 * 60 * 1000) break
    included.push(game)
  }
  const champions = new Map<number, number>()
  for (const { match } of included)
    if (match.championId)
      champions.set(match.championId, (champions.get(match.championId) ?? 0) + 1)
  return {
    from: included.at(-1)!.match.startedAt,
    to: sorted[0].match.startedAt + Math.max(0, toBasicInfo(sorted[0].summary).gameDuration) * 1000,
    games: included.length,
    wins: included.filter((g) => g.match.outcome === 'win').length,
    losses: included.filter((g) => g.match.outcome === 'loss').length,
    remakes: included.filter((g) => g.match.outcome === 'remake').length,
    durationSeconds: included.reduce(
      (sum, g) => sum + Math.max(0, toBasicInfo(g.summary).gameDuration),
      0
    ),
    champions: [...champions]
      .map(([championId, games]) => ({ championId, games }))
      .sort((a, b) => b.games - a.games),
    gameIds: included.map((g) => g.match.gameId)
  }
}

export function partnerSummary(games: CachedGame[], puuid: string): Partner[] {
  const partners = new Map<string, Partner>()
  const seen = new Set<number>()
  for (const { match, summary } of games) {
    if (match.outcome === 'remake' || seen.has(match.gameId)) continue
    seen.add(match.gameId)
    const participants =
      summary.source === 'sgp'
        ? summary.data.json.participants.map((p) => ({
            puuid: p.puuid,
            teamId: p.teamId,
            championId: p.championId,
            name: p.riotIdGameName || p.summonerName
          }))
        : summary.data.participants.map((p) => {
            const identity = summary.data.participantIdentities.find(
              (i) => i.participantId === p.participantId
            )?.player
            return {
              puuid: identity?.puuid,
              teamId: p.teamId,
              championId: p.championId,
              name: identity?.gameName || identity?.summonerName || ''
            }
          })
    const own = participants.find((p) => p.puuid === puuid)
    if (!own) continue
    for (const other of participants) {
      if (!other.puuid || other.puuid === puuid || other.teamId !== own.teamId) continue
      let partner = partners.get(other.puuid)
      if (!partner) {
        partner = {
          puuid: other.puuid,
          name: other.name,
          games: 0,
          wins: 0,
          losses: 0,
          gameIds: [],
          combinations: []
        }
        partners.set(other.puuid, partner)
      }
      partner.games++
      partner.wins += Number(match.outcome === 'win')
      partner.losses += Number(match.outcome === 'loss')
      partner.gameIds.push(match.gameId)
      const combo = partner.combinations.find(
        (c) => c.own === own.championId && c.partner === other.championId
      )
      if (combo) combo.games++
      else partner.combinations.push({ own: own.championId, partner: other.championId, games: 1 })
    }
  }
  return [...partners.values()]
    .filter((p) => p.games >= 2)
    .sort((a, b) => b.games - a.games)
    .map((p) => ({ ...p, combinations: p.combinations.sort((a, b) => b.games - a.games) }))
    .slice(0, 30)
}
