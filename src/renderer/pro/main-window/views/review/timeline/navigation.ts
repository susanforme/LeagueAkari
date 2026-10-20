import type { ReviewEvent } from '@shared/pro/review'

export function parseTime(text: string, duration: number) {
  const match = /^(\d+):([0-5]\d)$/.exec(text.trim())
  if (!match) return null
  const value = (Number(match[1]) * 60 + Number(match[2])) * 1000
  return Number.isSafeInteger(value) && value <= duration ? value : null
}

export function adjacentEvent(
  events: ReviewEvent[],
  timestamp: number,
  selectedId: string | null,
  direction: -1 | 1
) {
  const selected = events.findIndex(
    (event) => event.id === selectedId && event.timestamp === timestamp
  )
  if (selected !== -1) return events[selected + direction]
  return direction === 1
    ? events.find((event) => event.timestamp >= timestamp)
    : events.findLast((event) => event.timestamp <= timestamp)
}

export function timelineRange(timestamp: number, duration: number, span: number) {
  const from = Math.max(0, Math.min(duration - span, timestamp - span / 2))
  return { from, to: Math.min(duration, from + span) }
}

// Keep neighboring hit targets apart without snapping isolated events away from their timestamps.
export function groupEvents(events: ReviewEvent[], from: number, to: number, width: number) {
  const size = Math.max(32, width)
  const groups: { left: number; events: ReviewEvent[] }[] = []
  for (const event of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
    if (event.timestamp < from || event.timestamp > to) continue
    const pixel = Math.max(
      16,
      Math.min(size - 16, ((event.timestamp - from) / Math.max(1, to - from)) * size)
    )
    const last = groups.at(-1)
    if (last && pixel - (last.left * size) / 100 < 32) last.events.push(event)
    else groups.push({ left: (pixel / size) * 100, events: [event] })
  }
  return groups
}
