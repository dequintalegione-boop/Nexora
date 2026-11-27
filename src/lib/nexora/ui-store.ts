import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Priority, TaskStatus } from "./types"
import type { TaskFilterGroup } from "./task-filters"
import type { KanbanGroupBy } from "./kanban"

export type TaskTableColumn =
  | "title"
  | "status"
  | "priority"
  | "dueDate"
  | "scheduledDate"
  | "projects"
  | "tags"
  | "estimate"
  | "actual"
  | "updatedAt"

export const DEFAULT_TASK_TABLE_COLUMNS: TaskTableColumn[] = [
  "title", "status", "priority", "dueDate", "projects",
]

export const TASK_TABLE_COLUMN_LABELS: Record<TaskTableColumn, string> = {
  title: "Задача",
  status: "Статус",
  priority: "Приоритет",
  dueDate: "Срок",
  scheduledDate: "Запланировано",
  projects: "Проекты",
  tags: "Метки",
  estimate: "Оценка, мин",
  actual: "Факт, мин",
  updatedAt: "Изменено",
}

export type SavedTaskView = {
  id: string
  name: string
  filter: "all" | TaskStatus
  priorityFilter: "all" | Priority
  projectFilter: string
  sortBy: "priority" | "due" | "created" | "title"
  quickFilter: "all" | "today" | "inbox" | "overdue" | "week" | "unblocked"
  search: string
  layout: "list" | "table" | "kanban"
  columns?: TaskTableColumn[]
  advancedFilter?: TaskFilterGroup
}

type UIState = {
  taskId: string | null
  savedTaskViews: SavedTaskView[]
  taskTableColumns: TaskTableColumn[]
  kanbanGroupBy: KanbanGroupBy
  setTaskId: (id: string | null) => void
  saveTaskView: (view: Omit<SavedTaskView, "id">) => void
  removeTaskView: (id: string) => void
  toggleTaskTableColumn: (column: TaskTableColumn) => void
  setKanbanGroupBy: (groupBy: KanbanGroupBy) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      taskId: null,
      savedTaskViews: [],
      taskTableColumns: DEFAULT_TASK_TABLE_COLUMNS,
      kanbanGroupBy: "status",
      setTaskId: (taskId) => set({ taskId }),
      saveTaskView: (view) => set((state) => ({
        savedTaskViews: [
          ...state.savedTaskViews,
          { ...view, id: `view_${Date.now().toString(36)}` },
        ],
      })),
      removeTaskView: (id) => set((state) => ({
        savedTaskViews: state.savedTaskViews.filter((view) => view.id !== id),
      })),
      setKanbanGroupBy: (kanbanGroupBy) => set({ kanbanGroupBy }),
      toggleTaskTableColumn: (column) => set((state) => {
        const current = state.taskTableColumns ?? DEFAULT_TASK_TABLE_COLUMNS
        if (current.includes(column)) {
          if (column === "title" || current.length === 1) return state
          return { taskTableColumns: current.filter((item) => item !== column) }
        }
        return { taskTableColumns: [...current, column] }
      }),
    }),
    {
      name: "nexora-ui-v1",
      partialize: (state) => ({
        savedTaskViews: state.savedTaskViews,
        taskTableColumns: state.taskTableColumns,
        kanbanGroupBy: state.kanbanGroupBy,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<UIState>),
        taskTableColumns: (persisted as Partial<UIState>).taskTableColumns ?? DEFAULT_TASK_TABLE_COLUMNS,
        kanbanGroupBy: (persisted as Partial<UIState>).kanbanGroupBy ?? "status",
      }),
    },
  ),
)
