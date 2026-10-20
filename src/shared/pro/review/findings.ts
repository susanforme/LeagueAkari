import type { BaselineMetric, Insights } from '../progress'
import type { ReviewReport } from './index'

export interface ReviewFinding {
  kind: 'goldDrop' | 'farm' | 'goldDeficit' | 'deathBeforeObjective' | 'deaths'
  value: number
  baseline?: number
  samples?: number
  occurrences?: number
  evidence?: { from: number; to: number; metric: 'goldDiff' | 'cs' | 'gold' }
  comparisonId?: string
}

// Five comparable games are the minimum used by the existing personal baseline.
function baseline(insights: Insights | null, id: BaselineMetric['id']) {
  const metric = insights?.metrics.find((metric) => metric.id === id)
  return metric && metric.samples.length >= 5 ? metric : undefined
}

export function reviewFindings(report: ReviewReport, insights: Insights | null = null) {
  const analysis = report.analysis
  if (analysis.limitations.includes('unsupportedMode') || analysis.metrics.outcome === 'remake')
    return []
  const findings: ReviewFinding[] = []
  const hasTimeline = !analysis.limitations.includes('timelineMissing')
  const points = hasTimeline ? analysis.points : []
  let goldDrop: ReviewFinding | undefined
  // Compare observed endpoints within five minutes, never across missing snapshots.
  for (let end = 1; end < points.length; end++) {
    const last = points[end]
    if (last.goldDiff === null) continue
    for (let start = end - 1; start >= 0; start--) {
      const first = points[start]
      if (
        last.timestamp - first.timestamp > 300_000 ||
        points[start + 1].timestamp - first.timestamp > 90_000 ||
        first.goldDiff === null
      )
        break
      const drop = first.goldDiff - last.goldDiff
      if (drop >= 500 && (!goldDrop || drop > goldDrop.value))
        goldDrop = {
          kind: 'goldDrop',
          value: drop,
          evidence: { from: first.timestamp, to: last.timestamp, metric: 'goldDiff' }
        }
    }
  }
  if (goldDrop) findings.push(goldDrop)

  // Prefer a laning checkpoint, then use the available full-match farm rate.
  for (const id of hasTimeline
    ? (['cs15', 'cs10', 'csPerMin'] as const)
    : (['csPerMin'] as const)) {
    const metric = baseline(insights, id)
    if (
      !metric ||
      metric.current === null ||
      metric.median === null ||
      metric.q1 === null ||
      metric.current >= metric.q1
    )
      continue
    const target = id === 'cs15' ? 900_000 : 600_000
    const point = analysis.checkpoints.find((checkpoint) => checkpoint.target === target)?.point
    const checkpointMetric = id !== 'csPerMin'
    if (checkpointMetric && !point) continue
    const comparison = metric.samples
      .filter((sample) => sample.value >= metric.median!)
      .sort((a, b) => Math.abs(a.value - metric.median!) - Math.abs(b.value - metric.median!))[0]
    findings.push({
      kind: 'farm',
      value: metric.current,
      baseline: metric.median,
      samples: metric.samples.length,
      evidence: checkpointMetric
        ? { from: Math.max(0, point!.timestamp - 60_000), to: point!.timestamp, metric: 'cs' }
        : undefined,
      comparisonId: comparison?.reportId
    })
    break
  }

  const death = hasTimeline
    ? analysis.events.find(
        (event) =>
          event.type === 'CHAMPION_KILL' &&
          event.victimId === analysis.participantId &&
          analysis.events.some(
            (objective) =>
              ['ELITE_MONSTER_KILL', 'BUILDING_KILL'].includes(objective.type) &&
              objective.timestamp >= event.timestamp &&
              objective.timestamp - event.timestamp <= 60_000
          )
      )
    : undefined
  if (death) {
    const metric = baseline(insights, 'deathBeforeObjective')
    findings.push({
      kind: 'deathBeforeObjective',
      value: death.timestamp,
      samples: metric?.samples.length,
      occurrences: metric?.samples.filter((sample) => sample.value === 1).length,
      evidence: {
        from: Math.max(0, death.timestamp - 60_000),
        to: Math.min(analysis.duration, death.timestamp + 60_000),
        metric: 'gold'
      }
    })
  }
  const checkpoint = hasTimeline
    ? analysis.checkpoints.find((checkpoint) => checkpoint.target === 600_000)?.point
    : null
  if (!goldDrop && checkpoint?.goldDiff != null && checkpoint.goldDiff < 0) {
    const metric = baseline(insights, 'goldDeficit10')
    findings.push({
      kind: 'goldDeficit',
      value: -checkpoint.goldDiff,
      samples: metric?.samples.length,
      occurrences: metric?.samples.filter((sample) => sample.value === 1).length,
      evidence: {
        from: Math.max(0, checkpoint.timestamp - 60_000),
        to: checkpoint.timestamp,
        metric: 'goldDiff'
      }
    })
  }
  const deaths = baseline(insights, 'deathsPer10')
  if (
    !death &&
    deaths?.current != null &&
    deaths.median !== null &&
    deaths.q3 !== null &&
    deaths.current > deaths.q3
  )
    findings.push({
      kind: 'deaths',
      value: deaths.current,
      baseline: deaths.median,
      samples: deaths.samples.length
    })
  return findings.slice(0, 3)
}
