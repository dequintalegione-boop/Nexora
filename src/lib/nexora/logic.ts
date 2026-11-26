import { PRIORITY_LABEL } from "./copy"
import { addDays, weekday } from "./dates"
import type { DailyEntry, Goal, Habit, HabitLog, Priority, Project, Task } from "./types"

const PRIORITY_SCORE: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 3,
  high: 5,
  critical: 8,
}

export function logKey(habitId: string, date: string): string {
  return `${habitId}|${date}`
}

export function logMap(logs: HabitLog[]): Map<string, HabitLog> {
  const map = new Map<string, HabitLog>()
  for (const log of logs) map.set(logKey(log.habitId, log.date), log)
  return map
}

export function isScheduled(habit: Habit, date: string): boolean {
  if (!habit.active) return false
  const day = weekday(date) // 0 = Sunday
  return habit.schedule.days.includes(day)
}

export function isDoneLog(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log || log.skipped) return false
  if (habit.measurementType === "boolean") return Boolean(log.value)
  if (habit.targetValue != null) return Number(log.value) >= habit.targetValue
  return Number(log.value) > 0
}

export function isPartialLog(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log || log.skipped || habit.measurementType === "boolean") return false
  if (habit.targetValue == null) return false
  const v = Number(log.value)
  return v > 0 && v < habit.targetValue
}

export function streak(habit: Habit, logs: Map<string, HabitLog>, today: string): number {
  let count = 0
  let d = today
  for (let i = 0; i < 400; i++) {
    if (isScheduled(habit, d)) {
      const log = logs.get(logKey(habit.id, d))
      if (isDoneLog(habit, log)) count++
      else break
    }
    d = addDays(d, -1)
  }
  return count
}

export function longestStreak(habit: Habit, logs: HabitLog[]): number {
  const map = logMap(logs)
  // simple approximation: check last 365 days
  let best = 0
  let current = 0
  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < 365; i++) {
    const d = addDays(today, -i)
    if (!isScheduled(habit, d)) continue
    if (isDoneLog(habit, map.get(logKey(habit.id, d)))) {
      current++
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

export function regularity(habit: Habit, logs: Map<string, HabitLog>, today: string, days = 30): number {
  let scheduled = 0
  let done = 0
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i)
    if (isScheduled(habit, d)) {
      scheduled++
      if (isDoneLog(habit, logs.get(logKey(habit.id, d)))) done++
    }
  }
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
}

export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.progress != null) return project.progress
  const related = tasks.filter((t) => t.projectId === project.id && !t.archived)
  if (related.length === 0) return 0
  const done = related.filter((t) => t.status === "done").length
  return Math.round((done / related.length) * 100)
}

export function isBlocked(task: Task, tasks: Task[]): boolean {
  if (!task.dependsOn?.length) return false
  return task.dependsOn.some((id) => {
    const dep = tasks.find((t) => t.id === id)
    return dep && dep.status !== "done" && !dep.archived
  })
}

export function isOpenTask(task: Task): boolean {
  return !task.archived && task.status !== "done" && task.status !== "cancelled"
}

export function isTodayTask(task: Task, today: string): boolean {
  if (task.archived) return false
  return (
    task.scheduledDate === today ||
    task.dueDate === today ||
    task.status === "in_progress"
  )
}

export function dayTaskPool(tasks: Task[], today: string): Task[] {
  return tasks.filter(
    (t) =>
      !t.archived &&
      (t.scheduledDate === today ||
        t.dueDate === today ||
        t.status === "in_progress" ||
        t.status === "planned")
  )
}

export function suggestTask(
  tasks: Task[],
  today: string,
  opts: { minutes?: number; energy?: number; skip?: string[] } = {}
): Task | null {
  const skip = new Set(opts.skip || [])
  const candidates = tasks.filter((t) => {
    if (!isOpenTask(t)) return false
    if (skip.has(t.id)) return false
    if (isBlocked(t, tasks)) return false
    if (opts.minutes && t.estimatedMinutes && t.estimatedMinutes > opts.minutes) return false
    return true
  })
  if (candidates.length === 0) return null

  const scored = candidates.map((t) => {
    let score = PRIORITY_SCORE[t.priority] * 10
    if (t.status === "in_progress") score += 25
    if (t.dueDate && t.dueDate < today) score += 40
    if (t.dueDate === today) score += 20
    if (t.scheduledDate === today) score += 15
    if (opts.energy != null && opts.energy <= 3 && t.priority === "critical") score -= 15
    return { t, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].t
}

export function habitRate(habit: Habit, logs: Map<string, HabitLog>, today: string, days = 7): number {
  return regularity(habit, logs, today, days)
}

export function isStaleProject(project: Project, today: string): boolean {
  if (project.status !== "active") return false
  // simple: if no update in 21 days
  const updated = project.updatedAt?.slice(0, 10)
  if (!updated) return false
  return addDays(updated, 21) < today
}

export function goalNeedsReview(goal: Goal, today: string): boolean {
  if (goal.status !== "active") return false
  if (goal.targetDate && goal.targetDate < today) return true
  return false
}

export function entryMood(entries: DailyEntry[], date: string): number | undefined {
  return entries.find((e) => e.date === date)?.mood
}
