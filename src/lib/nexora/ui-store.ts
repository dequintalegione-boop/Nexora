import { create } from "zustand"

type UIState = {
  taskId: string | null
  setTaskId: (id: string | null) => void
}

export const useUI = create<UIState>((set) => ({
  taskId: null,
  setTaskId: (taskId) => set({ taskId }),
}))
