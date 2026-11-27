import { create } from "zustand"
import { persist } from "zustand/middleware"
import { STATUS_LABEL, WIDGETS, isDoneStatus } from "./copy"
import { addDays, isoDate } from "./dates"
import { buildSeed } from "./seed"
import { getTasksDueForAutomation, getTasksDueSoonForAutomation, runTaskAutomations } from "./automations"
import { CURRENT_SCHEMA_VERSION, migratePersistedData } from "./migrate"
import type { TaskAutomationRule } from "./automations"
import { buildNextTaskOccurrence, canAddTaskDependency, canSetTaskParent, updateRecurrenceSeriesTasks } from "./task-logic"
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
  RecurrenceRule,
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
    notificationsEnabled: false,
  }
}

function emptyData(): Persisted {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
    automationRules: [],
    automationRuns: [],
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
  skipTaskOccurrence: (id: string) => boolean
  updateRecurrenceSeries: (id: string, rule?: RecurrenceRule) => number
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
  addAutomationRule: (rule: Omit<TaskAutomationRule, "id" | "createdAt" | "updatedAt">) => string
  updateAutomationRule: (id: string, patch: Partial<TaskAutomationRule>) => void
  removeAutomationRule: (id: string) => void
  runDueAutomations: () => void
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
          current.automationRules ?? [],
          current.automationRuns ?? [],
        ].some((items) => items.length > 0)
        if (hasUserData) return
        const seed = buildSeed()
        set((state) => ({
          ...seed,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          settings: keepPrefs
            ? { ...seed.settings, ...state.settings, initialized: true }
            : { ...seed.settings, initialized: true },
          hydrated: true,
        }))
      },

      replaceAll: (data) => {
        const migrated = migratePersistedData(data)
        set({ ...migrated.data, automationRules: migrated.data.automationRules ?? [], automationRuns: migrated.data.automationRuns ?? [], hydrated: true })
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

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
          startAt: input.startAt,
          endAt: input.endAt,
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
        set((s) => {
          const event = { type: "task.created" as const, taskId: id, eventId: nid("event"), occurredAt: now }
          const result = runTaskAutomations([task, ...s.tasks], s.automationRules ?? [], event)
          return { tasks: result.tasks, automationRuns: [...result.runs, ...(s.automationRuns ?? [])].slice(0, 200) }
        })
        return id
      },

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowISO() } : t)),
        })),

      setTaskStatus: (id, status) =>
        set((s) => {
          const now = nowISO()
          const current = s.tasks.find((task) => task.id === id)
          if (!current || current.status === status) return s

          const nextTasks = s.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  status,
                  completedAt: isDoneStatus(status, s.settings) ? now : undefined,
                  updatedAt: now,
                  history: [
                    ...(task.history ?? []),
                    { at: now, change: `Статус → ${s.settings.taskStatusLabels?.[status]?.trim() || STATUS_LABEL[status] || status}` },
                  ].slice(-100),
                }
              : task
          )

          if (isDoneStatus(status, s.settings) && !isDoneStatus(current.status, s.settings)) {
            const next = buildNextTaskOccurrence(current, now)
            if (next) {
              const seriesId = current.recurrenceParentId ?? current.id
              const alreadyCreated = s.tasks.some(
                (task) =>
                  (task.recurrenceParentId ?? task.id) === seriesId &&
                  task.occurrenceDate === next.occurrenceDate
              )
              if (!alreadyCreated) nextTasks.unshift({ ...next, id: nid("task") })
            }
          }

          const statusEvent = { type: "task.status_changed" as const, taskId: id, eventId: nid("event"), occurredAt: now }
          const statusResult = runTaskAutomations(nextTasks, s.automationRules ?? [], statusEvent)
          const completionResult =
            isDoneStatus(statusResult.tasks.find((task) => task.id === id)?.status ?? "", s.settings) &&
            !isDoneStatus(current.status, s.settings)
              ? runTaskAutomations(statusResult.tasks, s.automationRules ?? [], {
                  type: "task.completed",
                  taskId: id,
                  eventId: nid("event"),
                  occurredAt: now,
                })
              : { tasks: statusResult.tasks, runs: [] }
          return {
            tasks: completionResult.tasks,
            automationRuns: [...completionResult.runs, ...statusResult.runs, ...(s.automationRuns ?? [])].slice(0, 200),
          }
        }),

      updateRecurrenceSeries: (id, rule) => {
        const now = nowISO()
        let updatedCount = 0
        set((state) => {
          const result = updateRecurrenceSeriesTasks(state.tasks, id, rule, now)
          updatedCount = result.updatedCount
          return { tasks: result.tasks }
        })
        return updatedCount
      },

      skipTaskOccurrence: (id) => {
        const current = get().tasks.find((task) => task.id === id)
        if (!current || current.deletedAt || current.archived) return false
        if (!current.recurrenceRule && !current.repeat) return false
        if (isDoneStatus(current.status, get().settings) || current.status === "cancelled") return false

        const now = nowISO()
        const occurrenceKey =
          current.occurrenceDate ?? current.scheduledDate ?? current.dueDate ?? now.slice(0, 10)
        const skippedOccurrences = [...new Set([...(current.skippedOccurrences ?? []), occurrenceKey])]
        const next = buildNextTaskOccurrence({ ...current, skippedOccurrences }, now)

        set((state) => {
          const nextTasks = state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  status: "cancelled" as const,
                  completedAt: undefined,
                  skippedOccurrences,
                  updatedAt: now,
                  history: [
                    ...(task.history ?? []),
                    { at: now, change: `Повторение ${occurrenceKey} пропущено` },
                  ].slice(-100),
                }
              : task
          )
          if (next) {
            const seriesId = current.recurrenceParentId ?? current.id
            const exists = state.tasks.some(
              (task) =>
                (task.recurrenceParentId ?? task.id) === seriesId && task.occurrenceDate === next.occurrenceDate
            )
            if (!exists) nextTasks.unshift({ ...next, id: nid("task") })
          }
          return { tasks: nextTasks }
        })
        return true
      },

      archiveTask: (id) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    archived: true,
                    archivedAt: now,
                    updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Задача архивирована" }].slice(-100),
                  }
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
                ? {
                    ...t,
                    archived: false,
                    archivedAt: undefined,
                    deletedAt: undefined,
                    updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Задача восстановлена" }].slice(-100),
                  }
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
                ? {
                    ...t,
                    deletedAt: now,
                    updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Задача перемещена в корзину" }].slice(-100),
                  }
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
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  parentId,
                  updatedAt: now,
                  history: [
                    ...(t.history ?? []),
                    { at: now, change: parentId ? "Изменена родительская задача" : "Связь с родителем удалена" },
                  ].slice(-100),
                }
              : t
          ),
        }))
        return true
      },

      addTaskDependency: (id, dependencyId) => {
        const tasks = get().tasks
        if (!canAddTaskDependency(tasks, id, dependencyId)) return false
        const now = nowISO()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  dependsOn: [...new Set([...(t.dependsOn ?? []), dependencyId])],
                  updatedAt: now,
                  history: [...(t.history ?? []), { at: now, change: "Добавлена зависимость" }].slice(-100),
                }
              : t
          ),
        }))
        return true
      },

      removeTaskDependency: (id, dependencyId) =>
        set((s) => {
          const now = nowISO()
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    dependsOn: (t.dependsOn ?? []).filter((dependency) => dependency !== dependencyId),
                    updatedAt: now,
                    history: [...(t.history ?? []), { at: now, change: "Удалена зависимость" }].slice(-100),
                  }
                : t
            ),
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
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p)),
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
          directions: s.directions.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: nowISO() } : d)),
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
          habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: nowISO() } : h)),
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
              entries: s.entries.map((e) => (e.id === existing.id ? { ...e, ...patch, updatedAt: now } : e)),
            }
          }
          return {
            entries: [...s.entries, { id: nid("entry"), createdAt: now, updatedAt: now, date, ...patch }],
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
              notes: input.notes,
            },
            ...s.goals,
          ],
        }))
        return id
      },

      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowISO() } : g)),
        })),

      startTimer: (input) => {
        const now = nowISO()
        set({
          activeTimer: {
            kind: input?.kind ?? "focus",
            startedAt: now,
            sessionStartedAt: now,
            taskId: input?.taskId,
            label: input?.title,
            accumulatedMs: 0,
          },
        })
      },

      pauseTimer: () =>
        set((s) => {
          if (!s.activeTimer || s.activeTimer.pausedAt) return s
          const started = new Date(s.activeTimer.startedAt).getTime()
          const accumulated = (s.activeTimer.accumulatedMs ?? 0) + (Date.now() - started)
          return {
            activeTimer: {
              ...s.activeTimer,
              pausedAt: nowISO(),
              accumulatedMs: accumulated,
            },
          }
        }),

      resumeTimer: () =>
        set((s) => {
          if (!s.activeTimer?.pausedAt) return s
          return {
            activeTimer: {
              ...s.activeTimer,
              startedAt: nowISO(),
              pausedAt: undefined,
            },
          }
        }),

      stopTimer: () => {
        const s = get()
        if (!s.activeTimer) return null
        const now = nowISO()
        const started = new Date(s.activeTimer.startedAt).getTime()
        let ms = s.activeTimer.accumulatedMs ?? 0
        if (!s.activeTimer.pausedAt) ms += Date.now() - started
        const durationMinutes = Math.max(1, Math.round(ms / 60000))
        const session: TimeSession = {
          id: nid("sess"),
          createdAt: now,
          updatedAt: now,
          kind: s.activeTimer.kind,
          startedAt: s.activeTimer.sessionStartedAt ?? s.activeTimer.startedAt,
          endedAt: now,
          taskId: s.activeTimer.taskId,
          title: s.activeTimer.label,
          durationMinutes,
        }
        set((state) => {
          const tasks = state.activeTimer?.taskId
            ? state.tasks.map((t) =>
                t.id === state.activeTimer!.taskId
                  ? {
                      ...t,
                      actualMinutes: (t.actualMinutes ?? 0) + durationMinutes,
                      updatedAt: now,
                    }
                  : t
              )
            : state.tasks
          return {
            sessions: [session, ...state.sessions],
            activeTimer: null,
            tasks,
          }
        })
        return session.id
      },

      setTimerIntent: (taskId) => set({ timerIntent: taskId }),

      addAutomationRule: (input) => {
        const now = nowISO()
        const id = nid("automation")
        set((state) => ({
          automationRules: [...(state.automationRules ?? []), { ...input, id, createdAt: now, updatedAt: now }],
        }))
        return id
      },
      updateAutomationRule: (id, patch) =>
        set((state) => ({
          automationRules: (state.automationRules ?? []).map((rule) =>
            rule.id === id ? { ...rule, ...patch, id, updatedAt: nowISO() } : rule
          ),
        })),
      removeAutomationRule: (id) =>
        set((state) => ({
          automationRules: (state.automationRules ?? []).filter((rule) => rule.id !== id),
        })),

      runDueAutomations: () => {
        const state = get()
        const nowDate = new Date()
        const rules = state.automationRules ?? []
        const priorRuns = state.automationRuns ?? []

        const dueCandidates = getTasksDueForAutomation(state.tasks, priorRuns, nowDate)

        const dueSoonIds = new Set<string>()
        const dueSoonRules = rules.filter((r) => r.enabled && r.trigger === "task.due_soon")
        for (const rule of dueSoonRules) {
          const days = rule.daysBefore ?? 1
          for (const task of getTasksDueSoonForAutomation(state.tasks, priorRuns, days, nowDate)) {
            dueSoonIds.add(task.id)
          }
        }
        const dueSoonCandidates = state.tasks.filter((t) => dueSoonIds.has(t.id))

        if (dueCandidates.length === 0 && dueSoonCandidates.length === 0) return

        let tasks = state.tasks
        const allRuns = [...priorRuns]
        const now = nowISO()

        for (const task of dueCandidates) {
          const result = runTaskAutomations(tasks, rules, {
            type: "task.due",
            taskId: task.id,
            eventId: nid("event"),
            occurredAt: now,
          })
          tasks = result.tasks
          allRuns.unshift(...result.runs)
        }

        for (const task of dueSoonCandidates) {
          const today = nowDate.toISOString().slice(0, 10)
          const matchingRules = rules.filter((rule) => {
            if (!rule.enabled || rule.trigger !== "task.due_soon") return false
            if (!task.dueDate || task.dueDate <= today) return false
            const days = rule.daysBefore ?? 1
            const horizon = new Date(`${today}T00:00:00.000Z`)
            horizon.setUTCDate(horizon.getUTCDate() + Math.max(1, Math.floor(days) || 1))
            return task.dueDate <= horizon.toISOString().slice(0, 10)
          })
          const result = runTaskAutomations(tasks, matchingRules, {
            type: "task.due_soon",
            taskId: task.id,
            eventId: nid("event"),
            occurredAt: now,
          })
          tasks = result.tasks
          allRuns.unshift(...result.runs)
        }

        set({
          tasks,
          automationRuns: allRuns.slice(0, 200),
        })
      },
    }),
    {
      name: "nexora-v1",
      merge: (persisted, current) => {
        const raw = { ...current, ...(persisted as Partial<Store>) } as Partial<Store>
        const migrated = migratePersistedData(raw)
        return {
          ...current,
          ...migrated.data,
          automationRules: migrated.data.automationRules ?? [],
          automationRuns: migrated.data.automationRuns ?? [],
          schemaVersion: CURRENT_SCHEMA_VERSION,
        }
      },
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
    }
  )
)
