import type { PoolMatch } from '@shared/pro/champion-pool'
import type { ActivityPeriod, ProfileActivity } from '@shared/pro/profile'

const day = 86_400_000
export function activityStart(now: number) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - 29)
  return date.getTime()
}
export function summarizeActivity(
  matches: { match: PoolMatch; duration: number | null }[],
  now: number,
  truncated: boolean
): ProfileActivity {
  function period(from: number, to: number): ActivityPeriod {
    const included = matches.filter(
      ({ match }) => match.startedAt >= from && match.startedAt < to && match.outcome !== 'remake'
    )
    const durations = included.flatMap(({ duration }) =>
      duration !== null && Number.isFinite(duration) && duration > 0 ? [duration] : []
    )
    return {
      games: included.length,
      activeDays: new Set(included.map(({ match }) => new Date(match.startedAt).toDateString()))
        .size,
      wins: included.filter(({ match }) => match.outcome === 'win').length,
      losses: included.filter(({ match }) => match.outcome === 'loss').length,
      durationSeconds: durations.reduce((sum, value) => sum + value, 0),
      durationSamples: durations.length
    }
  }
  const from = activityStart(now)
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(from)
    date.setDate(date.getDate() + index)
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    return { date: date.getTime(), ...period(date.getTime(), Math.min(next.getTime(), now)) }
  })
  return {
    from,
    to: now,
    truncated,
    month: period(from, now),
    days,
    recentWeek: period(now - 7 * day, now),
    previousWeek: period(now - 14 * day, now - 7 * day)
  }
}
