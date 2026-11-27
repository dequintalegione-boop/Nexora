import { create } from "zustand"
import { persist } from "zustand/middleware"
import { STATUS_LABEL, WIDGETS, isDoneStatus } from "./copy"
import { buildSeed } from "./seed"
import { DEFAULT_POMODORO_SETTINGS, getNextPomodoroPhase, getPomodoroPhaseDurationMs, normalizePomodoroSettings } from "./pomodoro"
import { correctTimeSession } from "./time-tracking"
import { createTaskDomainEvent, taskEventBus } from "./task-events"
import type { CreateTaskDomainEventInput } from "./task-events"
import { createTaskRepository } from "./task-repository"
import { createTaskService } from "./task-service"
import { getTasksDueForAutomation, getTasksDueSoonForAutomation, runTaskAutomations } from "./automations"
import { CURRENT_SCHEMA_VERSION, migratePersistedData } from "./migrate"
import type { TaskAutomationRule } from "./automations"
import { buildNextTaskOccurrence, updateRecurrenceSeriesTasks } from "./task-logic"
import type {
  DailyEntry,
  Direction,
  Goal,
  Habit,
  Persisted,
  Project,
  SessionKind,
  Settings,
  Task,
  TaskStatus,
  RecurrenceRule,
  TimeSession,
  PomodoroPhase,
} from "./types"

function nid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

function localDateISO(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function defaultSettings(): Settings {
  return {
    initialized: false,
    theme: "dark",
    accent: "#3ddc97",
    displayName: "",
    weekStartsOn: 1,
    widgetOrder: WIDGETS.map((w) => w.id),
    hiddenWidgets: [],
    notificationsEnabled: false,
    pomodoro: { ...DEFAULT_POMODORO_SETTINGS },
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
  startPomodoro: (input?: { taskId?: string; title?: string }) => void
  advancePomodoro: (force?: boolean) => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => string | null
  updateTimeSession: (id: string, patch: { startedAt?: string; endedAt?: string; title?: string }) => boolean
  setTimerIntent: (taskId: string | null) => void
  addAutomationRule: (rule: Omit<TaskAutomationRule, "id" | "createdAt" | "updatedAt">) => string
  updateAutomationRule: (id: string, patch: Partial<TaskAutomationRule>) => void
  removeAutomationRule: (id: string) => void
  runDueAutomations: () => void
}

function createStoreTaskService(
  getTasks: () => Task[],
  setTasks: (tasks: Task[]) => void,
  isDone: (status: TaskStatus) => boolean,
) {
  const repository = createTaskRepository(getTasks, setTasks)
  return createTaskService(repository, taskEventBus, {
    now: nowISO,
    createId: (prefix) => nid(prefix),
    isDoneStatus: isDone,
  })
}

function publishStoreTaskEvent(
  input: Omit<CreateTaskDomainEventInput, "eventId" | "occurredAt">,
): void {
  taskEventBus.publish(createTaskDomainEvent({
    ...input,
    eventId: nid("event"),
    occurredAt: nowISO(),
  }))
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
        const recurrenceRule = input.recurrenceRule ?? (
          input.repeat ? { frequency: input.repeat, interval: 1 } : undefined
        )
        const recurrenceStartDate = recurrenceRule
          ? input.recurrenceStartDate ?? input.occurrenceDate ?? input.scheduledDate ?? input.dueDate ?? input.startAt?.slice(0, 10) ?? localDateISO()
          : input.recurrenceStartDate
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
          repeat: input.repeat ?? (
            recurrenceRule?.frequency === "daily" || recurrenceRule?.frequency === "weekly"
              ? recurrenceRule.frequency
              : undefined
          ),
          recurrenceRule,
          recurrenceParentId: input.recurrenceParentId,
          occurrenceDate: input.occurrenceDate,
          occurrenceNumber: input.occurrenceNumber,
          recurrenceStartDate,
          recurrenceStartScheduledDate: recurrenceRule
            ? input.recurrenceStartScheduledDate ?? input.scheduledDate
            : input.recurrenceStartScheduledDate,
          recurrenceStartDueDate: recurrenceRule
            ? input.recurrenceStartDueDate ?? input.dueDate
            : input.recurrenceStartDueDate,
          recurrenceStartStartAt: recurrenceRule
            ? input.recurrenceStartStartAt ?? input.startAt
            : input.recurrenceStartStartAt,
          recurrenceStartEndAt: recurrenceRule
            ? input.recurrenceStartEndAt ?? input.endAt
            : input.recurrenceStartEndAt,
          skippedOccurrences: input.skippedOccurrences ?? [],
          reminders: input.reminders ?? [],
          links: input.links ?? [],
          contexts: input.contexts ?? [],
          history: [{ at: now, change: "Задача создана" }],
        }
        const repository = createTaskRepository(
          () => get().tasks,
          (tasks) => {
            const event = { type: "task.created" as const, taskId: id, eventId: nid("event"), occurredAt: now }
            const result = runTaskAutomations(tasks, get().automationRules ?? [], event)
            set({
              tasks: result.tasks,
              automationRuns: [...result.runs, ...(get().automationRuns ?? [])].slice(0, 200),
            })
          },
        )
        const service = createTaskService(repository, taskEventBus, {
          now: nowISO,
          createId: (prefix) => nid(prefix),
          isDoneStatus: (status) => isDoneStatus(status, get().settings),
        })
        service.create(task, { source: "ui", correlationId: id })
        return id
      },

      updateTask: (id, patch) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        service.update(id, patch)
      },

      setTaskStatus: (id, status) => {
        const before = get().tasks.find((task) => task.id === id)
        if (!before || before.status === status) return
        const now = nowISO()

        set((s) => {
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
        })

        const after = get().tasks.find((task) => task.id === id)
        if (!after) return
        const correlationId = nid("corr")
        publishStoreTaskEvent({ type: "task.updated", entityId: id, before, after, source: "ui", correlationId })
        if (before.status !== after.status) {
          publishStoreTaskEvent({ type: "task.status.changed", entityId: id, before, after, source: "ui", correlationId })
        }
        const wasDone = isDoneStatus(before.status, get().settings)
        const isDone = isDoneStatus(after.status, get().settings)
        if (!wasDone && isDone) {
          publishStoreTaskEvent({ type: "task.completed", entityId: id, before, after, source: "ui", correlationId })
          if (before.recurrenceRule || before.repeat) {
            publishStoreTaskEvent({
              type: "recurring.instance.completed",
              entityId: id,
              before,
              after,
              source: "recurrence",
              correlationId,
              metadata: { occurrenceDate: before.occurrenceDate ?? before.scheduledDate ?? null },
            })
          }
        } else if (wasDone && !isDone) {
          publishStoreTaskEvent({ type: "task.uncompleted", entityId: id, before, after, source: "ui", correlationId })
        }
      },

      updateRecurrenceSeries: (id, rule) => {
        const before = get().tasks.find((task) => task.id === id)
        const now = nowISO()
        let updatedCount = 0
        set((state) => {
          const result = updateRecurrenceSeriesTasks(state.tasks, id, rule, now)
          updatedCount = result.updatedCount
          return { tasks: result.tasks }
        })
        const after = get().tasks.find((task) => task.id === id)
        if (before && after && updatedCount > 0) {
          publishStoreTaskEvent({
            type: "task.recurrence.changed",
            entityId: id,
            before,
            after,
            source: "recurrence",
            correlationId: nid("corr"),
          })
        }
        return updatedCount
      },

      skipTaskOccurrence: (id) => {
        const before = get().tasks.find((task) => task.id === id)
        if (!before || before.deletedAt || before.archived) return false
        if (!before.recurrenceRule && !before.repeat) return false
        if (isDoneStatus(before.status, get().settings) || before.status === "cancelled") return false

        const now = nowISO()
        const occurrenceKey =
          before.occurrenceDate ?? before.scheduledDate ?? before.dueDate ?? now.slice(0, 10)
        const skippedOccurrences = [...new Set([...(before.skippedOccurrences ?? []), occurrenceKey])]
        const next = buildNextTaskOccurrence({ ...before, skippedOccurrences }, now)

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
            const seriesId = before.recurrenceParentId ?? before.id
            const exists = state.tasks.some(
              (task) =>
                (task.recurrenceParentId ?? task.id) === seriesId && task.occurrenceDate === next.occurrenceDate
            )
            if (!exists) nextTasks.unshift({ ...next, id: nid("task") })
          }
          return { tasks: nextTasks }
        })

        const after = get().tasks.find((task) => task.id === id)
        if (after) {
          const correlationId = nid("corr")
          publishStoreTaskEvent({
            type: "task.updated",
            entityId: id,
            before,
            after,
            source: "recurrence",
            correlationId,
          })
          publishStoreTaskEvent({
            type: "task.status.changed",
            entityId: id,
            before,
            after,
            source: "recurrence",
            correlationId,
          })
          publishStoreTaskEvent({
            type: "recurring.instance.skipped",
            entityId: id,
            before,
            after,
            source: "recurrence",
            correlationId,
            metadata: { occurrenceDate: occurrenceKey },
          })
        }
        return true
      },

      archiveTask: (id) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        service.archive(id)
      },

      restoreTask: (id) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        service.restore(id)
      },

      removeTask: (id) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        service.moveToTrash(id)
      },

      permanentlyDeleteTask: (id) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        service.permanentlyDelete(id)
      },

      setTaskParent: (id, parentId) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        return service.setParent(id, parentId)
      },

      addTaskDependency: (id, dependencyId) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        return service.addDependency(id, dependencyId)
      },

      removeTaskDependency: (id, dependencyId) => {
        const service = createStoreTaskService(
          () => get().tasks,
          (tasks) => set({ tasks }),
          (status) => isDoneStatus(status, get().settings),
        )
        service.removeDependency(id, dependencyId)
      },

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
        const timerId = nid("timer")
        const kind = input?.kind ?? "focus"
        set({
          activeTimer: {
            timerId,
            kind,
            startedAt: now,
            sessionStartedAt: now,
            taskId: input?.taskId,
            label: input?.title,
            accumulatedMs: 0,
          },
        })
        publishStoreTaskEvent({
          type: "time.started",
          entityType: "timer",
          entityId: timerId,
          source: "timer",
          correlationId: timerId,
          metadata: {
            timerId,
            taskId: input?.taskId ?? null,
            kind,
            startedAt: now,
          },
        })
      },

      startPomodoro: (input) => {
        const now = nowISO()
        const timerId = nid("timer")
        const pomodoroId = nid("pomodoro")
        const config = normalizePomodoroSettings(get().settings.pomodoro)
        const phaseDurationMs = getPomodoroPhaseDurationMs("focus", config)
        set({
          activeTimer: {
            timerId,
            pomodoroId,
            kind: "focus",
            startedAt: now,
            sessionStartedAt: now,
            taskId: input?.taskId,
            label: input?.title ?? "Pomodoro · Фокус",
            accumulatedMs: 0,
            pomodoro: {
              phase: "focus",
              completedFocusCycles: 0,
              phaseDurationMs,
              cyclesBeforeLongBreak: config.cyclesBeforeLongBreak,
              autoStartNext: config.autoStartNext,
            },
          },
        })
        publishStoreTaskEvent({
          type: "time.started",
          entityType: "timer",
          entityId: timerId,
          source: "timer",
          correlationId: pomodoroId,
          metadata: {
            timerId,
            pomodoroId,
            taskId: input?.taskId ?? null,
            kind: "focus",
            phase: "focus",
            startedAt: now,
          },
        })
        publishStoreTaskEvent({
          type: "pomodoro.started",
          entityType: "pomodoro",
          entityId: pomodoroId,
          source: "timer",
          correlationId: pomodoroId,
          metadata: {
            timerId,
            taskId: input?.taskId ?? null,
            phase: "focus",
            phaseDurationMs,
            cyclesBeforeLongBreak: config.cyclesBeforeLongBreak,
            autoStartNext: config.autoStartNext,
          },
        })
      },

      advancePomodoro: (force = false) => {
        const current = get().activeTimer
        const plan = current?.pomodoro
        if (!current || !plan) return

        const elapsedMs = Math.max(
          0,
          (current.accumulatedMs ?? 0) +
            (current.pausedAt ? 0 : Date.now() - new Date(current.startedAt).getTime()),
        )
        const reachedEnd = elapsedMs >= plan.phaseDurationMs
        if (!force && !reachedEnd) return

        // Without auto-start, pause at the exact phase boundary and wait for confirmation.
        if (!force && !plan.autoStartNext) {
          const pausedAt = nowISO()
          set({
            activeTimer: {
              ...current,
              pausedAt,
              accumulatedMs: plan.phaseDurationMs,
            },
          })
          const timerId = current.timerId ?? current.sessionStartedAt ?? current.startedAt
          const correlationId = current.pomodoroId ?? timerId
          publishStoreTaskEvent({
            type: "time.paused",
            entityType: "timer",
            entityId: timerId,
            source: "timer",
            correlationId,
            metadata: {
              timerId,
              pomodoroId: current.pomodoroId ?? null,
              taskId: current.taskId ?? null,
              phase: plan.phase,
              reason: "phase_boundary",
              pausedAt,
            },
          })
          return
        }

        const now = nowISO()
        const recordedMs = Math.min(elapsedMs, plan.phaseDurationMs)
        const session: TimeSession | null = recordedMs >= 1_000
          ? {
              id: nid("sess"),
              createdAt: now,
              updatedAt: now,
              kind: plan.phase === "focus" ? "focus" : "break",
              startedAt: current.sessionStartedAt ?? current.startedAt,
              endedAt: now,
              taskId: current.taskId,
              title: current.label ?? (plan.phase === "focus" ? "Pomodoro · Фокус" : "Pomodoro · Перерыв"),
              durationMinutes: Math.max(1, Math.round(recordedMs / 60_000)),
            }
          : null

        const next = getNextPomodoroPhase(
          plan.phase,
          plan.completedFocusCycles,
          plan.cyclesBeforeLongBreak,
        )
        const config = normalizePomodoroSettings(get().settings.pomodoro)
        const nextKind: SessionKind = next.phase === "focus" ? "focus" : "break"
        const nextLabel = next.phase === "focus"
          ? "Pomodoro · Фокус"
          : next.phase === "long_break"
            ? "Pomodoro · Длинный перерыв"
            : "Pomodoro · Короткий перерыв"
        const nextTimerId = nid("timer")
        const pomodoroId = current.pomodoroId ?? current.timerId ?? current.sessionStartedAt ?? current.startedAt
        const nextActive = {
          timerId: nextTimerId,
          pomodoroId,
          kind: nextKind,
          startedAt: now,
          sessionStartedAt: now,
          taskId: current.taskId,
          label: nextLabel,
          accumulatedMs: 0,
          pomodoro: {
            ...next,
            phaseDurationMs: getPomodoroPhaseDurationMs(next.phase as PomodoroPhase, config),
            cyclesBeforeLongBreak: plan.cyclesBeforeLongBreak,
            autoStartNext: plan.autoStartNext,
          },
        }

        set((state) => {
          const tasks = session?.kind === "focus" && session.taskId
            ? state.tasks.map((task) =>
                task.id === session.taskId
                  ? {
                      ...task,
                      actualMinutes: (task.actualMinutes ?? 0) + session.durationMinutes,
                      updatedAt: now,
                    }
                  : task,
              )
            : state.tasks
          return {
            sessions: session ? [session, ...state.sessions] : state.sessions,
            tasks,
            activeTimer: nextActive,
          }
        })

        const currentTimerId = current.timerId ?? current.sessionStartedAt ?? current.startedAt
        const pomodoroCorrelationId = current.pomodoroId ?? currentTimerId
        if (session) {
          publishStoreTaskEvent({
            type: "time.stopped",
            entityType: "time_session",
            entityId: session.id,
            source: "timer",
            correlationId: pomodoroCorrelationId,
            metadata: {
              timerId: currentTimerId,
              pomodoroId: current.pomodoroId ?? null,
              taskId: session.taskId ?? null,
              kind: session.kind,
              durationMinutes: session.durationMinutes,
              phase: plan.phase,
              sessionSaved: true,
            },
          })
        }
        publishStoreTaskEvent({
          type: reachedEnd ? "pomodoro.completed" : "pomodoro.interrupted",
          entityType: "pomodoro",
          entityId: pomodoroCorrelationId,
          source: "timer",
          correlationId: pomodoroCorrelationId,
          metadata: {
            timerId: currentTimerId,
            taskId: current.taskId ?? null,
            phase: plan.phase,
            durationMs: recordedMs,
            plannedDurationMs: plan.phaseDurationMs,
            sessionId: session?.id ?? null,
            completedFocusCycles: plan.completedFocusCycles,
            reason: reachedEnd ? "phase_completed" : "skipped",
          },
        })
        publishStoreTaskEvent({
          type: "time.started",
          entityType: "timer",
          entityId: nextTimerId,
          source: "timer",
          correlationId: pomodoroCorrelationId,
          metadata: {
            timerId: nextTimerId,
            pomodoroId: pomodoroCorrelationId,
            taskId: current.taskId ?? null,
            kind: nextKind,
            phase: next.phase,
            startedAt: now,
          },
        })
      },

      pauseTimer: () => {
        const current = get().activeTimer
        if (!current || current.pausedAt) return
        const now = nowISO()
        const started = new Date(current.startedAt).getTime()
        const accumulated = (current.accumulatedMs ?? 0) + (Date.now() - started)
        set({
          activeTimer: {
            ...current,
            timerId: current.timerId ?? current.sessionStartedAt ?? current.startedAt,
            pausedAt: now,
            accumulatedMs: accumulated,
          },
        })
        const timerId = current.timerId ?? current.sessionStartedAt ?? current.startedAt
        publishStoreTaskEvent({
          type: "time.paused",
          entityType: "timer",
          entityId: timerId,
          source: "timer",
          correlationId: current.pomodoroId ?? timerId,
          metadata: {
            timerId,
            pomodoroId: current.pomodoroId ?? null,
            taskId: current.taskId ?? null,
            pausedAt: now,
          },
        })
      },

      resumeTimer: () => {
        const current = get().activeTimer
        if (!current?.pausedAt) return
        const now = nowISO()
        const timerId = current.timerId ?? current.sessionStartedAt ?? current.startedAt
        set({
          activeTimer: {
            ...current,
            timerId,
            startedAt: now,
            pausedAt: undefined,
          },
        })
        publishStoreTaskEvent({
          type: "time.resumed",
          entityType: "timer",
          entityId: timerId,
          source: "timer",
          correlationId: current.pomodoroId ?? timerId,
          metadata: {
            timerId,
            pomodoroId: current.pomodoroId ?? null,
            taskId: current.taskId ?? null,
            resumedAt: now,
          },
        })
      },

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
          const tasks = state.activeTimer?.taskId && state.activeTimer.kind === "focus"
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
        const timerId = s.activeTimer.timerId ?? s.activeTimer.sessionStartedAt ?? s.activeTimer.startedAt
        const correlationId = s.activeTimer.pomodoroId ?? timerId
        publishStoreTaskEvent({
          type: "time.stopped",
          entityType: "time_session",
          entityId: session.id,
          source: "timer",
          correlationId,
          metadata: {
            timerId,
            pomodoroId: s.activeTimer.pomodoroId ?? null,
            taskId: session.taskId ?? null,
            kind: session.kind,
            durationMinutes: session.durationMinutes,
            sessionSaved: true,
            reason: "user_stopped",
          },
        })
        if (s.activeTimer.pomodoro) {
          const phaseCompleted = ms >= s.activeTimer.pomodoro.phaseDurationMs
          publishStoreTaskEvent({
            type: phaseCompleted ? "pomodoro.completed" : "pomodoro.interrupted",
            entityType: "pomodoro",
            entityId: correlationId,
            source: "timer",
            correlationId,
            metadata: {
              timerId,
              taskId: session.taskId ?? null,
              phase: s.activeTimer.pomodoro.phase,
              durationMs: Math.min(ms, s.activeTimer.pomodoro.phaseDurationMs),
              plannedDurationMs: s.activeTimer.pomodoro.phaseDurationMs,
              sessionId: session.id,
              reason: phaseCompleted ? "phase_completed_then_stopped" : "timer_stopped",
            },
          })
        }
        return session.id
      },

      updateTimeSession: (id, patch) => {
        let updated = false
        let previousSession: TimeSession | undefined
        let updatedSession: TimeSession | undefined
        set((state) => {
          const result = correctTimeSession(state.sessions, id, patch, nowISO())
          if (!result) return state
          updated = true
          previousSession = result.previous
          updatedSession = result.updated
          const durationDelta = result.updated.durationMinutes - result.previous.durationMinutes
          const tasks = result.previous.taskId && result.previous.kind === "focus"
            ? state.tasks.map((task) =>
                task.id === result.previous.taskId
                  ? {
                      ...task,
                      actualMinutes: Math.max(0, (task.actualMinutes ?? 0) + durationDelta),
                      updatedAt: result.updated.updatedAt,
                    }
                  : task,
              )
            : state.tasks
          return { sessions: result.sessions, tasks }
        })
        if (updated && previousSession && updatedSession) {
          publishStoreTaskEvent({
            type: "time.session.corrected",
            entityType: "time_session",
            entityId: id,
            source: "ui",
            correlationId: id,
            metadata: {
              taskId: updatedSession.taskId ?? null,
              kind: updatedSession.kind,
              previousDurationMinutes: previousSession.durationMinutes,
              durationMinutes: updatedSession.durationMinutes,
              durationDeltaMinutes: updatedSession.durationMinutes - previousSession.durationMinutes,
              titleChanged: previousSession.title !== updatedSession.title,
              timeRangeChanged:
                previousSession.startedAt !== updatedSession.startedAt ||
                previousSession.endedAt !== updatedSession.endedAt,
            },
          })
        }
        return updated
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
