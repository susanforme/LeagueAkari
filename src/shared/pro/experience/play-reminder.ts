import type { CachedGame, PlayReminder, ReminderSettings } from './index'
import { sessionSummary } from './summary'

export function playReminder(
  games: CachedGame[],
  settings: ReminderSettings,
  gameId: number,
  now: number
): Omit<PlayReminder, 'id'> | null {
  if (!settings.enabled) return null
  const session = sessionSummary(games)
  if (
    !session ||
    !Number.isFinite(session.to) ||
    !Number.isFinite(session.durationSeconds) ||
    session.gameIds[0] !== gameId ||
    now < session.to ||
    now - session.to > 2 * 60 * 60 * 1000
  )
    return null
  const played = games
    .filter((g) => session.gameIds.includes(g.match.gameId))
    .sort((a, b) => b.match.startedAt - a.match.startedAt)
  if (played[0].match.outcome === 'remake') return null
  let losses = 0
  for (const { match } of played) {
    if (match.outcome === 'remake') continue
    if (match.outcome !== 'loss') break
    losses++
  }
  const count = session.games - session.remakes
  const minutes = Math.floor(session.durationSeconds / 60)
  const reasons: PlayReminder['reasons'] = []
  if (settings.games > 0 && count >= settings.games) reasons.push('games')
  if (settings.minutes > 0 && minutes >= settings.minutes) reasons.push('minutes')
  if (settings.losses > 0 && losses >= settings.losses) reasons.push('losses')
  return reasons.length ? { games: count, minutes, losses, reasons } : null
}
