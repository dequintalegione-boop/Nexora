import type { Habit, HabitLog, Task, Priority } from "./types"
import { isoDate, addDays } from "./dates"

export function logKey(habitId: string, date: string) {
  return `${habitId}:${date}`
}

export function logMap(logs: HabitLog[]) {
  const map = new Map<string, HabitLog>()
  for (const log of logs) {
    map.set(logKey(log.habitId, log.date), log)
  }
  return map
}

export function isScheduled(habit: Habit, date: string): boolean {
  if (!habit.active) return false
  const d = new Date(date + "T12:00:00")
  const day = d.getDay() // 0 Sun .. 6 Sat
  return habit.schedule.days.includes(day)
}

export function isDoneLog(habit: Habit, log?: HabitLog): boolean {
  if (!log || log.skipped) return false
  if (habit.measurementType === "boolean") return Boolean(log.value)
  if (habit.targetValue != null) return Number(log.value) >= habit.targetValue
  return Number(log.value) > 0
}

export function isTodayTask(task: Task, today: string): boolean {
  if (task.archived) return false
  return task.scheduledDate === today || task.dueDate === today || (task.status === "in_progress")
}

export function dayTaskPool(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.archived && (
    t.scheduledDate === today ||
    t.dueDate === today ||
    t.status === "in_progress" ||
    t.status === "planned"
  ))
}

const PRIO_WEIGHT: Record<Priority, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
  none: 5,
}

export function suggestTask(
  tasks: Task[],
  today: string,
  opts: { minutes?: number; energy?: number; skip?: string[] } = {}
): Task | null {
  const skip = new Set(opts.skip || [])
  const candidates = tasks.filter((t) => {
    if (t.archived || t.status === "done" || t.status === "cancelled") return false
    if (skip.has(t.id)) return false
    if (opts.minutes && t.estimatedMinutes && t.estimatedMinutes > opts.minutes) return false
    return true
  })

  if (candidates.length === 0) return null

  // Score: priority + overdue + in_progress bonus
  const scored = candidates.map((t) => {
    let score = PRIO_WEIGHT[t.priority] ?? 0
    if (t.status === "in_progress") score += 30
    if (t.dueDate && t.dueDate < today) score += 50
    if (t.dueDate === today) score += 20
    if (t.scheduledDate === today) score += 15
    return { t, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].t
}
