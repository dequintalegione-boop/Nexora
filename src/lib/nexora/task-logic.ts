import type { Task } from "./types"

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

function shiftOccurrenceDate(date: string, frequency: "daily" | "weekly" | "monthly" | "yearly", interval: number): string {
  const [year, month, day] = date.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day, 12))
  const safeInterval = Math.max(1, Math.floor(interval) || 1)

  if (frequency === "daily") value.setUTCDate(value.getUTCDate() + safeInterval)
  if (frequency === "weekly") value.setUTCDate(value.getUTCDate() + safeInterval * 7)
  if (frequency === "monthly") {
    const originalDay = value.getUTCDate()
    value.setUTCDate(1)
    value.setUTCMonth(value.getUTCMonth() + safeInterval)
    const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate()
    value.setUTCDate(Math.min(originalDay, lastDay))
  }
  if (frequency === "yearly") {
    const originalMonth = value.getUTCMonth()
    const originalDay = value.getUTCDate()
    value.setUTCDate(1)
    value.setUTCFullYear(value.getUTCFullYear() + safeInterval)
    value.setUTCMonth(originalMonth)
    const lastDay = new Date(Date.UTC(value.getUTCFullYear(), originalMonth + 1, 0)).getUTCDate()
    value.setUTCDate(Math.min(originalDay, lastDay))
  }

  return value.toISOString().slice(0, 10)
}

export function buildNextTaskOccurrence(task: Task, now: string): Omit<Task, "id"> | null {
  const rule = task.recurrenceRule ?? (
    task.repeat ? { frequency: task.repeat, interval: 1 } : undefined
  )
  if (!rule) return null

  const occurrenceNumber = (task.occurrenceNumber ?? 1) + 1
  if (rule.count != null && occurrenceNumber > rule.count) return null

  const baseDate = task.occurrenceDate ?? task.scheduledDate ?? task.dueDate ?? now.slice(0, 10)
  const nextDate = shiftOccurrenceDate(baseDate, rule.frequency, rule.interval)
  if (rule.until && nextDate > rule.until) return null

  const shiftField = (date?: string) =>
    date ? shiftOccurrenceDate(date, rule.frequency, rule.interval) : undefined

  return {
    ...task,
    createdAt: now,
    updatedAt: now,
    archived: false,
    archivedAt: undefined,
    deletedAt: undefined,
    completedAt: undefined,
    status: "planned",
    scheduledDate: shiftField(task.scheduledDate),
    dueDate: shiftField(task.dueDate),
    occurrenceDate: nextDate,
    occurrenceNumber,
    recurrenceParentId: task.recurrenceParentId ?? task.id,
    parentId: task.parentId,
    dependsOn: [...(task.dependsOn ?? [])],
    history: [{ at: now, change: "Создано следующее повторение" }],
  }
}
