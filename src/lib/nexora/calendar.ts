import type { Task, TimeSession } from "./types"

function localDateTime(day: string, minutes: number): string {
  const date = new Date(`${day}T00:00:00`)
  date.setMinutes(minutes)
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
  return `${datePart}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function getCalendarTaskTime(task: Task): string | undefined {
  if (!task.startAt) return undefined
  const date = new Date(task.startAt)
  if (Number.isNaN(date.getTime())) return undefined
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** Move a task to a calendar slot while preserving its existing duration. */
export function getCalendarDropPatch(task: Task, day: string, startMinutes: number): Partial<Task> {
  const oldStart = task.startAt ? new Date(task.startAt) : null
  const oldEnd = task.endAt ? new Date(task.endAt) : null
  const oldDuration = oldStart && oldEnd
    ? Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000)
    : 60
  const duration = Number.isFinite(oldDuration) && oldDuration > 0
    ? Math.min(oldDuration, 24 * 60)
    : 60
  const startAt = localDateTime(day, startMinutes)
  const endAt = localDateTime(day, startMinutes + duration)
  return {
    scheduledDate: day,
    startAt,
    endAt,
    allDay: false,
  }
}

/** Move a task to a date cell, retaining its time when it has a time block. */
export function getCalendarDayDropPatch(task: Task, day: string): Partial<Task> {
  const time = getCalendarTaskTime(task)
  if (time && !task.allDay) {
    const [hours, minutes] = time.split(":").map(Number)
    return getCalendarDropPatch(task, day, hours * 60 + minutes)
  }
  return { scheduledDate: day }
}


export interface CalendarTimedRange {
  id: string
  start: number
  end: number
}

export interface CalendarTimedLayout extends CalendarTimedRange {
  column: number
  columns: number
  leftPercent: number
  widthPercent: number
}

/**
 * Places intersecting time blocks side-by-side. Adjacent blocks (end === start)
 * are allowed to reuse a column, so back-to-back tasks keep the full width.
 */
export function layoutCalendarEvents(
  ranges: readonly CalendarTimedRange[],
): CalendarTimedLayout[] {
  const valid = ranges
    .filter((range) =>
      Number.isFinite(range.start) &&
      Number.isFinite(range.end) &&
      range.end > range.start
    )
    .map((range) => ({ ...range }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id))

  const result: CalendarTimedLayout[] = []
  let cluster: Array<CalendarTimedRange & { column: number }> = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flush = () => {
    if (cluster.length === 0) return
    const columns = Math.max(1, ...cluster.map((item) => item.column + 1))
    for (const item of cluster) {
      result.push({
        id: item.id,
        start: item.start,
        end: item.end,
        column: item.column,
        columns,
        leftPercent: (item.column / columns) * 100,
        widthPercent: 100 / columns,
      })
    }
    cluster = []
    clusterEnd = Number.NEGATIVE_INFINITY
  }

  const laneEnds: number[] = []
  for (const range of valid) {
    if (cluster.length > 0 && range.start >= clusterEnd) {
      flush()
      laneEnds.length = 0
    }

    let column = laneEnds.findIndex((end) => end <= range.start)
    if (column === -1) {
      column = laneEnds.length
      laneEnds.push(range.end)
    } else {
      laneEnds[column] = range.end
    }
    cluster.push({ ...range, column })
    clusterEnd = Math.max(clusterEnd, range.end)
  }

  flush()
  return result
}

/** Create a scheduled time block from a selected calendar slot. */
export function getCalendarCreatePatch(
  day: string,
  startMinutes: number,
  durationMinutes = 60,
): Partial<Task> {
  const start = Math.max(0, Math.min(23 * 60 + 45, Math.round(startMinutes / 15) * 15))
  const duration = Math.max(15, Math.min(24 * 60 - start, Math.round(durationMinutes / 15) * 15))
  return {
    scheduledDate: day,
    startAt: localDateTime(day, start),
    endAt: localDateTime(day, start + duration),
    allDay: false,
  }
}

/** Update both ends of a time block after resizing it on the calendar. */
export function getCalendarResizePatch(
  _task: Task,
  day: string,
  startMinutes: number,
  endMinutes: number,
): Partial<Task> {
  const start = Math.max(0, Math.min(23 * 60 + 45, Math.round(startMinutes / 15) * 15))
  const end = Math.max(start + 15, Math.min(24 * 60, Math.round(endMinutes / 15) * 15))
  return {
    scheduledDate: day,
    startAt: localDateTime(day, start),
    endAt: localDateTime(day, end),
    allDay: false,
  }
}


/** Resolve a mouse-drag selection to an inclusive set of half-hour slots. */
export function getCalendarSelectionRange(
  anchorMinutes: number,
  deltaSteps: number,
  slotStep = 30,
  minMinutes = 0,
  maxMinutes = 24 * 60,
): { start: number; end: number } {
  const step = Math.max(1, Math.round(slotStep))
  const min = Math.max(0, Math.min(24 * 60 - step, Math.ceil(minMinutes / step) * step))
  const max = Math.max(min + step, Math.min(24 * 60, Math.floor(maxMinutes / step) * step))
  const anchor = Math.max(min, Math.min(max - step, Math.round(anchorMinutes / step) * step))
  const active = Math.max(min, Math.min(max - step, anchor + Math.round(deltaSteps) * step))
  return { start: Math.min(anchor, active), end: Math.max(anchor, active) + step }
}

/** Clip a completed time-tracking session to one local calendar day. */
export function getCalendarSessionRange(
  session: Pick<TimeSession, "startedAt" | "endedAt">,
  day: string,
): { start: number; end: number } | null {
  const start = new Date(session.startedAt)
  const end = new Date(session.endedAt)
  const dayStart = new Date(`${day}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || !Number.isFinite(dayStart.getTime())) {
    return null
  }
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const clippedStart = Math.max(start.getTime(), dayStart.getTime())
  const clippedEnd = Math.min(end.getTime(), dayEnd.getTime())
  if (clippedEnd <= clippedStart) return null
  return {
    start: Math.max(0, Math.floor((clippedStart - dayStart.getTime()) / 60_000)),
    end: Math.min(24 * 60, Math.ceil((clippedEnd - dayStart.getTime()) / 60_000)),
  }
}


/** Convert a pointer position inside a day column to the nearest visible time slot. */
export function getCalendarDropMinutes(
  clientY: number,
  top: number,
  height: number,
  startMinutes: number,
  endMinutes: number,
  slotStep = 30,
): number | null {
  if (
    !Number.isFinite(clientY) ||
    !Number.isFinite(top) ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    endMinutes <= startMinutes
  ) return null
  const step = Math.max(1, Math.round(slotStep))
  const ratio = Math.max(0, Math.min(1 - Number.EPSILON, (clientY - top) / height))
  const rawMinutes = startMinutes + ratio * (endMinutes - startMinutes)
  const lowerBound = Math.ceil(startMinutes / step) * step
  const upperBound = Math.max(lowerBound, Math.floor((endMinutes - step) / step) * step)
  return Math.max(lowerBound, Math.min(upperBound, Math.floor(rawMinutes / step) * step))
}
