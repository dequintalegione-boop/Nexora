import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Priority, TaskStatus } from "./types"

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
}

type UIState = {
  taskId: string | null
  savedTaskViews: SavedTaskView[]
  setTaskId: (id: string | null) => void
  saveTaskView: (view: Omit<SavedTaskView, "id">) => void
  removeTaskView: (id: string) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      taskId: null,
      savedTaskViews: [],
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
    }),
    {
      name: "nexora-ui-v1",
      partialize: (state) => ({ savedTaskViews: state.savedTaskViews }),
    },
  ),
)
