import type { Priority, Project, Task, TaskStatus } from "./types"

export type KanbanGroupBy = "status" | "priority" | "project"
export const KANBAN_NO_PROJECT = "__no_project__"

export function getKanbanTaskColumnIds(task: Task, groupBy: KanbanGroupBy): string[] {
  if (groupBy === "status") return [task.status]
  if (groupBy === "priority") return [task.priority]
  const ids = task.projectIds?.length ? task.projectIds : task.projectId ? [task.projectId] : []
  return ids.length ? [...new Set(ids)] : [KANBAN_NO_PROJECT]
}

export function getKanbanColumns(
  groupBy: KanbanGroupBy,
  projects: Project[],
  statusLabels: Record<TaskStatus, string>,
  priorityLabels: Record<Priority, string>,
): Array<{ id: string; label: string }> {
  if (groupBy === "status") {
    return Object.entries(statusLabels).map(([id, label]) => ({ id, label }))
  }
  if (groupBy === "priority") {
    return Object.entries(priorityLabels).map(([id, label]) => ({ id, label }))
  }
  return [
    ...projects.map((project) => ({
      id: project.id,
      label: project.archived ? `${project.title} · архив` : project.title,
    })),
    { id: KANBAN_NO_PROJECT, label: "Без проекта" },
  ]
}

export function getKanbanDropPatch(
  groupBy: KanbanGroupBy,
  columnId: string,
): Partial<Task> | null {
  if (groupBy === "status") return { status: columnId as TaskStatus }
  if (groupBy === "priority") return { priority: columnId as Priority }
  if (groupBy === "project") {
    return columnId === KANBAN_NO_PROJECT
      ? { projectId: undefined, projectIds: [] }
      : { projectId: columnId, projectIds: [columnId] }
  }
  return null
}
