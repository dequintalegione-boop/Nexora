import type { RecurrenceRule, Task } from "./types"
import { getNextRecurrenceOccurrence } from "./recurrence.ts"

export interface DependencyState {
  blockedBy: Task[]
  missingDependencyIds: string[]
  isBlocked: boolean
}

export function getTaskChildren(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((task) => task.parentId === taskId && !task.deletedAt)
}

export function getDependencyState(task: Task, tasks: Task[]): DependencyState {
  const byId = new Map(tasks.map((item) => [item.id, item]))
  const dependencyIds = task.dependsOn ?? []
  const blockedBy = dependencyIds
    .map((id) => byId.get(id))
    .filter((item): item is Task => Boolean(item && item.status !== "done" && !item.deletedAt))
  const missingDependencyIds = dependencyIds.filter((id) => !byId.has(id) || Boolean(byId.get(id)?.deletedAt))
  return {
    blockedBy,
    missingDependencyIds,
    isBlocked: blockedBy.length > 0 || missingDependencyIds.length > 0,
  }
}

export function canSetTaskParent(tasks: Task[], taskId: string, parentId?: string): boolean {
  if (!parentId) return true
  if (parentId === taskId || !tasks.some((task) => task.id === parentId && !task.deletedAt && !task.archived)) return false

  const visited = new Set([taskId])
  let cursor: string | undefined = parentId
  while (cursor) {
    if (visited.has(cursor)) return false
    visited.add(cursor)
    cursor = tasks.find((task) => task.id === cursor)?.parentId
  }
  return true
}

export function canAddTaskDependency(tasks: Task[], taskId: string, dependencyId: string): boolean {
  if (taskId === dependencyId || !tasks.some((task) => task.id === dependencyId && !task.deletedAt && !task.archived)) {
    return false
  }

  const byId = new Map(tasks.map((task) => [task.id, task]))
  const stack = [dependencyId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const currentId = stack.pop()!
    if (currentId === taskId) return false
    if (visited.has(currentId)) continue
    visited.add(currentId)
    stack.push(...(byId.get(currentId)?.dependsOn ?? []))
  }

  return true
}

function shiftCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days, 12))
  return value.toISOString().slice(0, 10)
}

function shiftCalendarDateTime(value: string | undefined, days: number): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return shiftCalendarDays(value.slice(0, 10), days) + value.slice(10)
}

export function buildNextTaskOccurrence(task: Task, now: string): Omit<Task, "id"> | null {
  const rule: RecurrenceRule | undefined = task.recurrenceRule ?? (
    task.repeat ? { frequency: task.repeat, interval: 1 } : undefined
  )
  if (!rule) return null
  if (rule.count != null && (task.occurrenceNumber ?? 1) >= rule.count) return null

  const baseDate = task.recurrenceStartDate ?? task.occurrenceDate ?? task.scheduledDate ?? task.dueDate ?? task.startAt?.slice(0, 10) ?? now.slice(0, 10)
  const currentOccurrenceDate = task.occurrenceDate ?? baseDate
  const nextOccurrence = getNextRecurrenceOccurrence(
    rule,
    baseDate,
    currentOccurrenceDate,
    task.skippedOccurrences ?? [],
  )
  if (!nextOccurrence) return null

  const dayOffset = Math.round(
    (new Date(nextOccurrence.date + "T12:00:00.000Z").getTime() -
      new Date(baseDate + "T12:00:00.000Z").getTime()) / 86400000
  )
  const scheduledAnchor = task.recurrenceStartScheduledDate ?? task.scheduledDate
  const dueAnchor = task.recurrenceStartDueDate ?? task.dueDate
  const startAtAnchor = task.recurrenceStartStartAt ?? task.startAt
  const endAtAnchor = task.recurrenceStartEndAt ?? task.endAt

  return {
    ...task,
    createdAt: now,
    updatedAt: now,
    archived: false,
    archivedAt: undefined,
    deletedAt: undefined,
    completedAt: undefined,
    status: "planned",
    scheduledDate: scheduledAnchor ? shiftCalendarDays(scheduledAnchor, dayOffset) : undefined,
    dueDate: dueAnchor ? shiftCalendarDays(dueAnchor, dayOffset) : undefined,
    startAt: shiftCalendarDateTime(startAtAnchor, dayOffset),
    endAt: shiftCalendarDateTime(endAtAnchor, dayOffset),
    recurrenceStartStartAt: startAtAnchor,
    recurrenceStartEndAt: endAtAnchor,
    occurrenceDate: nextOccurrence.date,
    occurrenceNumber: nextOccurrence.number,
    recurrenceStartDate: baseDate,
    recurrenceStartScheduledDate: scheduledAnchor,
    recurrenceStartDueDate: dueAnchor,
    recurrenceParentId: task.recurrenceParentId ?? task.id,
    parentId: task.parentId,
    dependsOn: [...(task.dependsOn ?? [])],
    skippedOccurrences: [...(task.skippedOccurrences ?? [])],
    history: [{ at: now, change: "Создано следующее повторение" }],
  }
}

export function updateRecurrenceSeriesTasks(
  tasks: Task[],
  taskId: string,
  rule: RecurrenceRule | undefined,
  now: string
): { tasks: Task[]; updatedCount: number } {
  const current = tasks.find((task) => task.id === taskId)
  if (!current || current.deletedAt || current.archived) return { tasks, updatedCount: 0 }

  const seriesId = current.recurrenceParentId ?? current.id
  let updatedCount = 0
  const nextTasks = tasks.map((task) => {
    const belongsToSeries = task.id === seriesId || task.recurrenceParentId === seriesId
    const isEditableOccurrence =
      task.id === seriesId ||
      (task.status !== "done" &&
        task.status !== "cancelled" &&
        !task.archived &&
        !task.deletedAt)
    if (!belongsToSeries || !isEditableOccurrence) return task

    updatedCount += 1
    return {
      ...task,
      recurrenceRule: rule
        ? {
            ...rule,
            ...(rule.weekdays ? { weekdays: [...rule.weekdays] } : {}),
            ...(rule.byDay ? { byDay: rule.byDay.map((item) => ({ ...item })) } : {}),
            ...(rule.byMonthDay ? { byMonthDay: [...rule.byMonthDay] } : {}),
            ...(rule.byMonth ? { byMonth: [...rule.byMonth] } : {}),
            ...(rule.excludeDates ? { excludeDates: [...rule.excludeDates] } : {}),
          }
        : undefined,
      repeat: rule?.frequency === "daily" || rule?.frequency === "weekly" ? rule.frequency : undefined,
      updatedAt: now,
      history: [
        ...(task.history ?? []),
        { at: now, change: "Правило повторения обновлено для всей серии" },
      ].slice(-100),
    }
  })

  return { tasks: nextTasks, updatedCount }
}
