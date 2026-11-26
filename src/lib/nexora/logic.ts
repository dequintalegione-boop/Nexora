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
  if (!habit.active || habit.archived) return false
  if (habit.startDate && date < habit.startDate) return false
  if (habit.endDate && date > habit.endDate) return false
  return habit.schedule.days.includes(weekday(date))
}

export function isDoneLog(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log || log.skipped) return false
  if (habit.measurementType === "boolean") return log.value === true || log.value === 1
  const target = habit.targetValue && habit.targetValue > 0 ? habit.targetValue : 1
  return Number(log.value) >= target
}

export function isPartialLog(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log || log.skipped || habit.measurementType === "boolean") return false
  const target = habit.targetValue && habit.targetValue > 0 ? habit.targetValue : 1
  const value = Number(log.value)
  return value > 0 && value < target
}

export function streak(habit: Habit, logs: Map<string, HabitLog>, today: string): number {
  let cursor = today
  if (!isDoneLog(habit, logs.get(logKey(habit.id, today)))) cursor = addDays(today, -1)
  let count = 0
  for (let i = 0; i < 400; i++) {
    if (habit.startDate && cursor < habit.startDate) break
    if (!isScheduled(habit, cursor)) {
      cursor = addDays(cursor, -1)
      continue
    }
    const log = logs.get(logKey(habit.id, cursor))
    if (log?.skipped) {
      cursor = addDays(cursor, -1)
      continue
    }
    if (isDoneLog(habit, log)) {
      count += 1
      cursor = addDays(cursor, -1)
      continue
    }
    break
  }
  return count
}

export function longestStreak(habit: Habit, logs: HabitLog[]): number {
  const dates = logs
    .filter((log) => log.habitId === habit.id && isDoneLog(habit, log))
    .map((log) => log.date)
    .sort()
  if (dates.length === 0) return 0
  let best = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1]
    const cur = dates[i]
    if (!prev || !cur) continue
    let expected = addDays(prev, 1)
    while (expected < cur && !isScheduled(habit, expected)) expected = addDays(expected, 1)
    if (expected === cur) run += 1
    else run = 1
    if (run > best) best = run
  }
  return best
}

export function regularity(habit: Habit, logs: Map<string, HabitLog>, today: string, days = 30): number {
  let due = 0
  let done = 0
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i)
    if (!isScheduled(habit, date)) continue
    due += 1
    if (isDoneLog(habit, logs.get(logKey(habit.id, date)))) done += 1
  }
  if (due === 0) return 0
  return Math.round((done / due) * 100)
}

export function projectProgress(project: Project, tasks: Task[]): number {
  if (typeof project.progress === "number") {
    return Math.max(0, Math.min(100, Math.round(project.progress)))
  }
  const related = tasks.filter(
    (task) => task.projectId === project.id && !task.archived && task.status !== "cancelled",
  )
  if (related.length === 0) return 0
  const done = related.filter((task) => task.status === "done").length
  return Math.round((done / related.length) * 100)
}

export function isBlocked(task: Task, tasks: Task[]): boolean {
  if (!task.dependsOn?.length) return false
  return task.dependsOn.some((id) => {
    const dep = tasks.find((item) => item.id === id)
    // Missing, archived, or cancelled dependencies must not block forever.
    if (!dep || dep.archived || dep.status === "cancelled") return false
    return dep.status !== "done"
  })
}

export function isOpenTask(task: Task): boolean {
  return !task.archived && task.status !== "done" && task.status !== "cancelled"
}

export function isTodayTask(task: Task, today: string): boolean {
  if (task.archived || task.status === "cancelled") return false
  if (task.scheduledDate === today || task.dueDate === today) return true
  if (task.dueDate && task.dueDate < today && task.status !== "done") return true
  if (task.status === "in_progress") return true
  return false
}

export interface Suggestion {
  task: Task
  reasons: string[]
}

export function suggestTask(
  tasks: Task[],
  today: string,
  options?: { minutes?: number; energy?: number; skip?: string[] },
): Suggestion | null {
  const skip = new Set(options?.skip ?? [])
  let best: { task: Task; reasons: string[]; score: number } | null = null
  for (const task of tasks) {
    if (!isOpenTask(task) || skip.has(task.id) || task.status === "waiting") continue
    if (isBlocked(task, tasks)) continue
    const reasons: string[] = []
    let score = PRIORITY_SCORE[task.priority]
    if (task.priority === "high" || task.priority === "critical") {
      reasons.push(`приоритет — ${PRIORITY_LABEL[task.priority].toLowerCase()}`)
    }
    if (task.dueDate && task.dueDate < today) {
      score += 6
      reasons.push("срок уже прошёл")
    } else if (task.dueDate === today) {
      score += 4
      reasons.push("срок сегодня")
    } else if (task.dueDate && task.dueDate <= addDays(today, 2)) {
      score += 2
      reasons.push("срок близко")
    }
    if (task.status === "in_progress") {
      score += 3
      reasons.push("уже в работе")
    }
    if (task.scheduledDate === today) {
      score += 2
      reasons.push("стоит в плане на сегодня")
    }
    if (options?.minutes && task.estimatedMinutes) {
      if (task.estimatedMinutes <= options.minutes) {
        score += 2
        reasons.push(`укладывается в ${options.minutes} мин`)
      } else {
        score -= 4
        reasons.push("дольше, чем есть времени")
      }
    }
    if (options?.energy !== undefined && options.energy <= 4) {
      if ((task.estimatedMinutes ?? 30) <= 30) {
        score += 2
        reasons.push("короткое дело при низкой энергии")
      } else score -= 2
    }
    if (reasons.length === 0) reasons.push("ничего срочнее не нашлось")
    const due = task.dueDate ?? "9999-99-99"
    const bestDue = best?.task.dueDate ?? "9999-99-99"
    if (!best || score > best.score || (score === best.score && due < bestDue)) {
      best = { task, reasons: reasons.slice(0, 3), score }
    }
  }
  if (!best) return null
  return { task: best.task, reasons: best.reasons }
}

export function dayTaskPool(tasks: Task[], today: string): Task[] {
  return tasks.filter((task) => {
    if (task.archived || task.status === "cancelled") return false
    return task.scheduledDate === today || task.dueDate === today
  })
}

export function habitRate(
  habits: Habit[],
  logs: Map<string, HabitLog>,
  date: string,
): { done: number; due: number } {
  const dueHabits = habits.filter((habit) => isScheduled(habit, date))
  const done = dueHabits.filter((habit) => isDoneLog(habit, logs.get(logKey(habit.id, date)))).length
  return { done, due: dueHabits.length }
}

export function isStaleProject(project: Project, today: string): boolean {
  if (project.archived || project.status !== "active") return false
  const updated = project.updatedAt.slice(0, 10)
  return updated <= addDays(today, -14)
}

export function goalNeedsReview(goal: Goal, today: string): boolean {
  return goal.status === "active" && !goal.archived && !!goal.targetDate && goal.targetDate < today
}

export interface Reminder {
  id: string
  title: string
  detail: string
  to: "/" | "/tasks" | "/journal" | "/habits" | "/goals" | "/projects"
  taskId?: string
}

export function buildReminders(input: {
  tasks: Task[]
  habits: Habit[]
  logs: Map<string, HabitLog>
  entries: DailyEntry[]
  goals: Goal[]
  projects: Project[]
  today: string
}): Reminder[] {
  const items: Reminder[] = []
  for (const task of input.tasks) {
    if (!isOpenTask(task)) continue
    if (task.dueDate && task.dueDate < input.today) {
      items.push({
        id: `overdue-${task.id}`,
        title: task.title,
        detail: "Просрочена",
        to: "/tasks",
        taskId: task.id,
      })
    }
  }
  for (const habit of input.habits) {
    if (!isScheduled(habit, input.today)) continue
    if (!isDoneLog(habit, input.logs.get(logKey(habit.id, input.today)))) {
      items.push({
        id: `habit-${habit.id}`,
        title: habit.title,
        detail: "Привычка на сегодня ещё не отмечена",
        to: "/habits",
      })
    }
  }
  for (const goal of input.goals) {
    if (goalNeedsReview(goal, input.today)) {
      items.push({
        id: `goal-${goal.id}`,
        title: goal.title,
        detail: "Цель с прошедшим сроком",
        to: "/goals",
      })
    }
  }
  for (const project of input.projects) {
    if (isStaleProject(project, input.today)) {
      items.push({
        id: `project-${project.id}`,
        title: project.title,
        detail: "Проект давно не обновлялся",
        to: "/projects",
      })
    }
  }
  return items.slice(0, 14)
}

export function entryMood(entries: DailyEntry[], date: string): number | undefined {
  return entries.find((entry) => entry.date === date)?.mood
}
