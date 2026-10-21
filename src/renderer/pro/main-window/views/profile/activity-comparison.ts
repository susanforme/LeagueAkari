import type { ActivityPeriod } from '@shared/pro/profile'

export function activityChanges(current: ActivityPeriod, previous: ActivityPeriod) {
  const percent = (next: number, before: number) =>
    before > 0 ? (100 * (next - before)) / before : null
  const currentResults = current.wins + current.losses
  const previousResults = previous.wins + previous.losses
  return {
    games: percent(current.games, previous.games),
    activeDays: percent(current.activeDays, previous.activeDays),
    duration:
      current.durationSamples === current.games && previous.durationSamples === previous.games
        ? percent(current.durationSeconds, previous.durationSeconds)
        : null,
    winRate:
      currentResults && previousResults
        ? 100 * (current.wins / currentResults - previous.wins / previousResults)
        : null
  }
}
