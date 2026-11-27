import { addDays } from "./dates"
import { expandTaskOccurrences, type TaskOccurrenceView } from "./recurrence"
import type { Task } from "./types"

export type TaskViewQuickFilter = "all" | "today" | "inbox" | "overdue" | "week" | "unblocked"

export type TaskViewItem = Task & {
  /** True when this row is generated from a recurrence rule and is not stored. */
  virtualOccurrence?: boolean
  /** Parent series id for a generated or saved recurrence instance. */
  recurrenceSeriesId?: string
}

export interface TaskOccurrenceViewRange {
  start: string
  end: string
}

export const TASK_VIEW_RECURRENCE_WINDOW_DAYS = 30

/** Keep list-like views bounded; quick filters narrow the occurrence window further. */
export function getTaskOccurrenceViewRange(
  today: string,
  quickFilter: TaskViewQuickFilter,
  windowDays = TASK_VIEW_RECURRENCE_WINDOW_DAYS,
): TaskOccurrenceViewRange {
  const days = Math.max(1, Math.min(365, Math.floor(windowDays) || TASK_VIEW_RECURRENCE_WINDOW_DAYS))
  if (quickFilter === "today" || quickFilter === "inbox") {
    return { start: today, end: today }
  }
  if (quickFilter === "week") {
    return { start: today, end: addDays(today, 7) }
  }
  if (quickFilter === "overdue") {
    return { start: addDays(today, -days), end: addDays(today, -1) }
  }
  return { start: addDays(today, -days), end: addDays(today, days) }
}

/**
 * Merge ordinary persisted tasks with only the recurrence instances needed by a task view.
 * Series roots stay available as the editable source even when their first occurrence is
 * outside the window. Saved instances replace their virtual counterpart by parent/date.
 */
export function expandTasksForView(
  tasks: Task[],
  range: TaskOccurrenceViewRange,
): TaskViewItem[] {
  const roots = tasks.filter((task) =>
    Boolean(task.recurrenceRule || task.repeat) &&
    (task.recurrenceParentId ?? task.id) === task.id &&
    !task.archived &&
    !task.deletedAt
  )
  const rootIds = new Set(roots.map((root) => root.id))
  const savedCandidates = tasks.filter((task) =>
    Boolean(task.recurrenceParentId && task.occurrenceDate && task.id !== task.recurrenceParentId && rootIds.has(task.recurrenceParentId))
  )
  const childIds = new Set(savedCandidates.map((task) => task.id))
  const ordinaryTasks = tasks.filter((task) => !rootIds.has(task.id) && !childIds.has(task.id))
  const savedByOccurrence = new Map<string, Task>()
  for (const task of savedCandidates) {
    savedByOccurrence.set(`${task.recurrenceParentId}::${task.occurrenceDate}`, task)
  }
  const savedInstances = [...savedByOccurrence.values()].filter((task) => !task.archived && !task.deletedAt)
  const occurrences: TaskOccurrenceView[] = expandTaskOccurrences(tasks, range.start, range.end)
  const occurrenceTasks: TaskViewItem[] = occurrences.map(({ task, isVirtual, seriesId }) => ({
    ...task,
    virtualOccurrence: isVirtual,
    recurrenceSeriesId: seriesId,
  }))
  const returnedIds = new Set(occurrenceTasks.map((task) => task.id))
  const returnedOccurrenceKeys = new Set(
    occurrences.map((occurrence) => `${occurrence.seriesId}::${occurrence.occurrenceDate}`),
  )
  const seriesMasters: TaskViewItem[] = roots.filter((root) => !returnedIds.has(root.id))
  const savedOutsideWindow: TaskViewItem[] = savedInstances
    .filter((task) => !returnedIds.has(task.id) && !returnedOccurrenceKeys.has(`${task.recurrenceParentId}::${task.occurrenceDate}`))
    .map((task) => ({
      ...task,
      virtualOccurrence: false,
      recurrenceSeriesId: task.recurrenceParentId!,
    }))

  return [...ordinaryTasks, ...seriesMasters, ...savedOutsideWindow, ...occurrenceTasks]
}
