import type { MetricId, MetricSample, ReportScope, TrainingGoal } from '@shared/pro/progress'
import type { ReviewReport } from '@shared/pro/review'

export function metricValue(report: ReviewReport, id: MetricId): number | null {
  const a = report.analysis,
    metrics = a.metrics
  if (a.limitations.includes('unsupportedMode') || metrics.outcome === 'remake') return null
  const checkpoint = (minute: number) =>
    a.checkpoints.find((p) => p.target === minute * 60_000)?.point
  if (id === 'cs10') return checkpoint(10)?.cs ?? null
  if (id === 'cs15') return checkpoint(15)?.cs ?? null
  if (id === 'goldDiff10') return checkpoint(10)?.goldDiff ?? null
  if (id === 'goldDiff15') return checkpoint(15)?.goldDiff ?? null
  if (id === 'csPerMin') return metrics.csPerMin
  if (id === 'deathsPer10')
    return metrics.deaths === null || a.duration <= 0
      ? null
      : metrics.deaths / (a.duration / 600_000)
  if (id === 'goldDeficit10') {
    const gold = checkpoint(10)?.goldDiff
    return gold == null ? null : Number(gold < 0)
  }
  if (!report.details || a.limitations.includes('timelineMissing')) return null
  const objectives = a.events.filter((e) =>
    ['ELITE_MONSTER_KILL', 'BUILDING_KILL'].includes(e.type)
  )
  if (!objectives.length) return null
  return Number(
    a.events.some(
      (e) =>
        e.type === 'CHAMPION_KILL' &&
        e.victimId === a.participantId &&
        objectives.some((o) => o.timestamp >= e.timestamp && o.timestamp - e.timestamp <= 60_000)
    )
  )
}
export function reportScope(report: ReportScope, allChampions: boolean): TrainingGoal['scope'] {
  const m = report.analysis.metrics
  return {
    queueId: m.queueId,
    position: m.position,
    patch: m.patch,
    championId: allChampions ? null : m.championId,
    version: report.analysis.version
  }
}
export function matchesScope(report: ReviewReport, scope: TrainingGoal['scope']) {
  const m = report.analysis.metrics
  return (
    scope.position !== 'UNKNOWN' &&
    !!scope.patch &&
    m.queueId === scope.queueId &&
    m.position === scope.position &&
    m.patch === scope.patch &&
    report.analysis.version === scope.version &&
    (scope.championId === null || m.championId === scope.championId)
  )
}
export function sample(report: ReviewReport, metric: MetricId): MetricSample | null {
  const value = metricValue(report, metric)
  return value === null || !Number.isFinite(value)
    ? null
    : {
        reportId: report.id,
        gameId: report.summary.gameId,
        startedAt: report.analysis.metrics.startedAt,
        value,
        timestamp:
          metric === 'goldDeficit10' || metric === 'goldDiff10' || metric === 'cs10'
            ? 600000
            : metric === 'cs15' || metric === 'goldDiff15'
              ? 900000
              : metric === 'deathBeforeObjective'
                ? report.analysis.events.find(
                    (e) =>
                      e.type === 'CHAMPION_KILL' &&
                      e.victimId === report.analysis.participantId &&
                      report.analysis.events.some(
                        (o) =>
                          ['ELITE_MONSTER_KILL', 'BUILDING_KILL'].includes(o.type) &&
                          o.timestamp >= e.timestamp &&
                          o.timestamp - e.timestamp <= 60000
                      )
                  )?.timestamp
                : undefined
      }
}
export function quantile(values: number[], fraction: number) {
  if (values.length < 5) return null
  const sorted = values.toSorted((a, b) => a - b),
    index = (sorted.length - 1) * fraction
  return (
    sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1)
  )
}
