import type { Task } from "./types"

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
