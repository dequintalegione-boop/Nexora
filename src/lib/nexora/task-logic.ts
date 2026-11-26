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
  const missingDependencyIds = dependencyIds.filter((id) => !byId.has(id))
  return {
    blockedBy,
    missingDependencyIds,
    isBlocked: blockedBy.length > 0 || missingDependencyIds.length > 0,
  }
}

export function canSetTaskParent(tasks: Task[], taskId: string, parentId?: string): boolean {
  if (!parentId) return true
  if (parentId === taskId || !tasks.some((task) => task.id === parentId && !task.deletedAt)) return false

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
  if (taskId === dependencyId || !tasks.some((task) => task.id === dependencyId && !task.deletedAt)) {
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
