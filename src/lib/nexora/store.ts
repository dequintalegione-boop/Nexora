import { create } from "zustand"
import { persist } from "zustand/middleware"
import { STATUS_LABEL, WIDGETS } from "./copy"
import { addDays, isoDate } from "./dates"
import { buildSeed } from "./seed"
import { canAddTaskDependency, canSetTaskParent } from "./task-logic"
import type {
  ActiveTimer,
  DailyEntry,
  Direction,
  Goal,
  Habit,
  HabitLog,
  Persisted,
  Project,
  SessionKind,
  Settings,
  Task,
  TaskStatus,
  TimeSession,
} from "./types"

function nid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

export function defaultSettings(): Settings {
  return {
    initialized: false,
    theme: "dark",
    accent: "#2dd4bf",
    displayName: "",
    weekStartsOn: 1,
    widgetOrder: WIDGETS.map((w) => w.id),
    hiddenWidgets: [],
  }
}

function emptyData(): Persisted {
  return {
    directions: [],
    projects: [],
    tasks: [],
    habits: [],
    habitLogs: [],
    entries: [],
    goals: [],
    sessions: [],
    activeTimer: null,
    settings: defaultSettings(),
  }
}

type Store = Persisted & {
  hydrated: boolean
  markHydrated: () => void
  timerIntent: string | null
  loadSeed: (keepPrefs?: boolean) => void
  replaceAll: (data: Persisted) => void
  updateSettings: (patch: Partial<Settings>) => void
  moveWidget: (id: string, dir: -1 | 1) => void
  toggleWidget: (id: string) => void
  addTask: (input: Partial<Task> & { title: string }) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  setTaskStatus: (id: string, status: TaskStatus) => void
  archiveTask: (id: string) => void
  restoreTask: (id: string) => void
  removeTask: (id: string) => void
  permanentlyDeleteTask: (id: string) => void
  setTaskParent: (id: string, parentId?: string) => boolean
  addTaskDependency: (id: string, dependencyId: string) => boolean
  removeTaskDependency: (id: string, dependencyId: string) => void
  addProject: (input: Partial<Project> & { title: string }) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  addDirection: (input: Partial<Direction> & { title: string }) => string
  updateDirection: (id: string, patch: Partial<Direction>) => void
  addHabit: (input: Partial<Habit> & { title: string }) => string
  updateHabit: (id: string, patch: Partial<Habit>) => void
  setHabitValue: (habitId: string, date: string, value: number | boolean) => void
  skipHabit: (habitId: string, date: string, reason?: string) => void
  clearHabitLog: (habitId: string, date: string) => void
  upsertEntry: (date: string, patch: Partial<DailyEntry>) => void
  addGoal: (input: Partial<Goal> & { title: string }) => string
  updateGoal: (id: string, patch: Partial<Goal>) => void
  startTimer: (input?: { taskId?: string; title?: string; kind?: SessionKind }) => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => string | null
  setTimerIntent: (taskId: string | null) => void
}

export const useNexora = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      timerIntent: null,

      loadSeed: (keepPrefs = false) => {
        const current = get()
        const hasUserData = [
          current.directions,
          current.projects,
          current.tasks,
          current.habits,
          current.habitLogs,
          current.entries,
          current.goals,
          current.sessions,
        ].some((items) => items.length > 0)

        // Demo data must never overwrite real user content.
        if (hasUserData) return

        const seed = buildSeed()
        set((state) => ({
          ...seed,
          settings: keepPrefs
            ? { ...seed.settings, ...state.settings, initialized: true }
            : { ...seed.settings, initialized: true },
          hydrated: true,
        }))
      },

      replaceAll: (data) => set({ ...data, hydrated: true }),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      moveWidget: (id, dir) =>
        set((s) => {
          const order = [...s.settings.widgetOrder]
          const idx = order.indexOf(id)
          if (idx < 0) return s
          const next = idx + dir
          if (next < 0 || next >= order.length) return s
          ;[order[idx], order[next]] = [order[next], order[idx]]
          return { settings: { ...s.settings, widgetOrder: order } }
        }),

      toggleWidget: (id) =>
        set((s) => {
          const hidden = new Set(s.settings.hiddenWidgets)
          if (hidden.has(id)) hidden.delete(id)
          else hidden.add(id)
          return { settings: { ...s.settings, hiddenWidgets: [...hidden] } }
        }),

      addTask: (input) => {
        const id = nid("task")
        const now = nowISO()
        const task: Task = {
          id,
          createdAt: now,
          updatedAt: now,
          title: input.title,
          status: input.status ?? "inbox",
          priority: input.priority ?? "none",
          description: input.description,
          dueDate: input.dueDate,
          scheduledDate: input.scheduledDate,
          projectId: input.projectId,
          directionId: input.directionId,
          estimatedMinutes: input.estimatedMinutes,
          tags: input.tags,
          projectIds: input.projectIds ?? (input.projectId ? [input.projectId] : undefined),
          parentId: input.parentId,
          dependsOn: input.dependsOn ?? [],
          recurrenceRule: input.recurrenceRule,
          reminders: input.reminders ?? [],
          links: input.links ?? [],
          contexts: input.contexts ?? [],
          history: [{ at: now, change: "Задача создана" }],
        }
        set((s) => ({ tasks: [task, ...s.tasks] }))
        return id
      },

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: nowISO() } : t
          ),
        })),

      setTaskStatus: (id, status) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    completedAt: status === "done" ? now : undefined,
                    updatedAt: now,
                    history: [
                      ...(t.history ?? []),
                      { at: now, change: `Статус → ${STATUS_LABEL[status]}` },
                    ].slice(-100),
                  }
                : t
            ),
          }
        }),

      archiveTask: (id) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? { ...t, archived: true, archivedAt: now, updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Задача архивирована" }].slice(-100) }
                : t
            ),
          }
        }),

      restoreTask: (id) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? { ...t, archived: false, archivedAt: undefined, deletedAt: undefined, updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Задача восстановлена" }].slice(-100) }
                : t
            ),
          }
        }),

      removeTask: (id) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? { ...t, deletedAt: now, updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Задача перемещена в корзину" }].slice(-100) }
                : t
            ),
          }
        }),

      permanentlyDeleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks
            .filter((t) => t.id !== id)
            .map((t) => ({
              ...t,
              parentId: t.parentId === id ? undefined : t.parentId,
              dependsOn: t.dependsOn?.filter((dependencyId) => dependencyId !== id),
            })),
        })),

      setTaskParent: (id, parentId) => {
        const tasks = get().tasks
        if (!canSetTaskParent(tasks, id, parentId)) return false
        const now = nowISO()
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === id ? {
            ...t, parentId, updatedAt: now,
            history: [...(t.history ?? []), { at: now, change: parentId ? "Изменена родительская задача" : "Связь с родителем удалена" }].slice(-100),
          } : t),
        }))
        return true
      },

      addTaskDependency: (id, dependencyId) => {
        const tasks = get().tasks
        if (!canAddTaskDependency(tasks, id, dependencyId)) return false
        const now = nowISO()
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === id ? {
            ...t, dependsOn: [...new Set([...(t.dependsOn ?? []), dependencyId])], updatedAt: now,
            history: [...(t.history ?? []), { at: now, change: "Добавлена зависимость" }].slice(-100),
          } : t),
        }))
        return true
      },

      removeTaskDependency: (id, dependencyId) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) => t.id === id ? {
              ...t, dependsOn: (t.dependsOn ?? []).filter((dependency) => dependency !== dependencyId), updatedAt: now,
              history: [...(t.history ?? []), { at: now, change: "Удалена зависимость" }].slice(-100),
            } : t),
          }
        }),

      addProject: (input) => {
        const id = nid("proj")
        const now = nowISO()
        set((s) => ({
          projects: [
            {
              id,
              createdAt: now,
              updatedAt: now,
              title: input.title,
              status: input.status ?? "active",
              priority: input.priority ?? "medium",
              directionId: input.directionId,
              description: input.description,
            },
            ...s.projects,
          ],
        }))
        return id
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p
          ),
        })),

      addDirection: (input) => {
        const id = nid("dir")
        const now = nowISO()
        set((s) => ({
          directions: [
            ...s.directions,
            {
              id,
              createdAt: now,
              updatedAt: now,
              title: input.title,
              color: input.color ?? "accent",
              order: s.directions.length,
              description: input.description,
            },
          ],
        }))
        return id
      },

      updateDirection: (id, patch) =>
        set((s) => ({
          directions: s.directions.map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: nowISO() } : d
          ),
        })),

      addHabit: (input) => {
        const id = nid("hab")
        const now = nowISO()
        set((s) => ({
          habits: [
            {
              id,
              createdAt: now,
              updatedAt: now,
              title: input.title,
              measurementType: input.measurementType ?? "boolean",
              unit: input.unit,
              targetValue: input.targetValue,
              schedule: input.schedule ?? { days: [1, 2, 3, 4, 5, 6, 0] },
              active: input.active ?? true,
              icon: input.icon,
            },
            ...s.habits,
          ],
        }))
        return id
      },

      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === id ? { ...h, ...patch, updatedAt: nowISO() } : h
          ),
        })),

      setHabitValue: (habitId, date, value) =>
        set((s) => {
          const existing = s.habitLogs.find((l) => l.habitId === habitId && l.date === date)
          const now = nowISO()
          if (existing) {
            return {
              habitLogs: s.habitLogs.map((l) =>
                l.id === existing.id
                  ? { ...l, value, skipped: false, skipReason: undefined, updatedAt: now }
                  : l
              ),
            }
          }
          return {
            habitLogs: [
              ...s.habitLogs,
              { id: nid("log"), createdAt: now, updatedAt: now, habitId, date, value },
            ],
          }
        }),

      skipHabit: (habitId, date, reason) =>
        set((s) => {
          const existing = s.habitLogs.find((l) => l.habitId === habitId && l.date === date)
          const now = nowISO()
          if (existing) {
            return {
              habitLogs: s.habitLogs.map((l) =>
                l.id === existing.id
                  ? { ...l, skipped: true, skipReason: reason, value: false, updatedAt: now }
                  : l
              ),
            }
          }
          return {
            habitLogs: [
              ...s.habitLogs,
              {
                id: nid("log"),
                createdAt: now,
                updatedAt: now,
                habitId,
                date,
                value: false,
                skipped: true,
                skipReason: reason,
              },
            ],
          }
        }),

      clearHabitLog: (habitId, date) =>
        set((s) => ({
          habitLogs: s.habitLogs.filter((l) => !(l.habitId === habitId && l.date === date)),
        })),

      upsertEntry: (date, patch) =>
        set((s) => {
          const now = nowISO()
          const existing = s.entries.find((e) => e.date === date)
          if (existing) {
            return {
              entries: s.entries.map((e) =>
                e.date === date
                  ? {
                      ...e,
                      ...patch,
                      reflection: patch.reflection
                        ? { ...e.reflection, ...patch.reflection }
                        : e.reflection,
                      updatedAt: now,
                    }
                  : e
              ),
            }
          }
          return {
            entries: [
              ...s.entries,
              { id: nid("entry"), createdAt: now, updatedAt: now, date, ...patch },
            ],
          }
        }),

      addGoal: (input) => {
        const id = nid("goal")
        const now = nowISO()
        set((s) => ({
          goals: [
            {
              id,
              createdAt: now,
              updatedAt: now,
              title: input.title,
              horizon: input.horizon ?? "monthly",
              status: input.status ?? "active",
              progress: input.progress ?? 0,
              description: input.description,
              targetDate: input.targetDate,
              projectIds: input.projectIds,
            },
            ...s.goals,
          ],
        }))
        return id
      },

      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, ...patch, updatedAt: nowISO() } : g
          ),
        })),

      startTimer: (input) => {
        const startedAt = nowISO()
        set({
          activeTimer: {
            kind: input?.kind ?? "focus",
            startedAt,
            sessionStartedAt: startedAt,
            taskId: input?.taskId,
            label: input?.title,
            accumulatedMs: 0,
          },
        })
      },

      pauseTimer: () =>
        set((s) => {
          if (!s.activeTimer || s.activeTimer.pausedAt) return s
          const elapsed =
            (s.activeTimer.accumulatedMs ?? 0) +
            (Date.now() - new Date(s.activeTimer.startedAt).getTime())
          return {
            activeTimer: {
              ...s.activeTimer,
              pausedAt: nowISO(),
              accumulatedMs: elapsed,
            },
          }
        }),

      resumeTimer: () =>
        set((s) => {
          if (!s.activeTimer || !s.activeTimer.pausedAt) return s
          return {
            activeTimer: {
              ...s.activeTimer,
              startedAt: nowISO(),
              pausedAt: undefined,
            },
          }
        }),

      stopTimer: () => {
        const timer = get().activeTimer
        if (!timer) return null
        const elapsed =
          (timer.accumulatedMs ?? 0) +
          (timer.pausedAt ? 0 : Date.now() - new Date(timer.startedAt).getTime())
        const minutes = Math.round(elapsed / 60000)
        const session: TimeSession = {
          id: nid("sess"),
          createdAt: nowISO(),
          updatedAt: nowISO(),
          kind: timer.kind,
          startedAt: timer.sessionStartedAt ?? timer.startedAt,
          endedAt: nowISO(),
          taskId: timer.taskId,
          title: timer.label,
          durationMinutes: minutes,
        }
        set((s) => ({
          activeTimer: null,
          sessions: [session, ...s.sessions],
        }))
        return session.id
      },

      setTimerIntent: (taskId) => set({ timerIntent: taskId }),
    }),
    {
      name: "nexora-v1",
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
    }
  )
)
