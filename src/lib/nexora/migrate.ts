import type { Persisted, Task } from "./types"
import type { TaskAutomationRule, TaskAutomationRun } from "./automations"

/** Current on-disk schema version for the Zustand persisted profile. */
export const CURRENT_SCHEMA_VERSION = 2

const SNAPSHOT_KEY = "nexora-migration-snapshot"

export interface MigrationResult {
  data: Persisted
  fromVersion: number
  toVersion: number
  migrated: boolean
  snapshotTaken: boolean
}

function builtinStatusCatalog(labels?: Partial<Record<string, string>>) {
  const base: Array<{ id: string; label: string; category: "open" | "done" | "cancelled"; order: number; builtin: true }> = [
    { id: "inbox", label: "Входящие", category: "open", order: 0, builtin: true },
    { id: "planned", label: "Запланирована", category: "open", order: 1, builtin: true },
    { id: "in_progress", label: "В процессе", category: "open", order: 2, builtin: true },
    { id: "waiting", label: "Ожидает", category: "open", order: 3, builtin: true },
    { id: "done", label: "Готово", category: "done", order: 4, builtin: true },
    { id: "cancelled", label: "Отменена", category: "cancelled", order: 5, builtin: true },
  ]
  return base.map((s) => ({ ...s, label: labels?.[s.id]?.trim() || s.label }))
}

function builtinPriorityCatalog(labels?: Partial<Record<string, string>>) {
  const base: Array<{ id: string; label: string; order: number; builtin: true }> = [
    { id: "none", label: "Без приоритета", order: 0, builtin: true },
    { id: "low", label: "Низкий", order: 1, builtin: true },
    { id: "medium", label: "Средний", order: 2, builtin: true },
    { id: "high", label: "Высокий", order: 3, builtin: true },
    { id: "critical", label: "Критический", order: 4, builtin: true },
  ]
  return base.map((p) => ({ ...p, label: labels?.[p.id]?.trim() || p.label }))
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function detectVersion(raw: Partial<Persisted> | null | undefined): number {
  if (!raw || typeof raw !== "object") return 0
  if (typeof raw.schemaVersion === "number" && Number.isFinite(raw.schemaVersion)) {
    return Math.max(0, Math.floor(raw.schemaVersion))
  }
  return 0
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    tags: Array.isArray(task.tags) ? task.tags : task.tags ? [String(task.tags)] : undefined,
    projectIds:
      Array.isArray(task.projectIds)
        ? task.projectIds
        : task.projectId
          ? [task.projectId]
          : task.projectIds,
    history: Array.isArray(task.history) ? task.history : [],
    reminders: Array.isArray(task.reminders) ? task.reminders : task.reminders,
    links: Array.isArray(task.links) ? task.links : task.links,
    contexts: Array.isArray(task.contexts) ? task.contexts : task.contexts,
  }
}

function migrateV0ToV1(data: Persisted): Persisted {
  return {
    ...data,
    schemaVersion: 1,
    automationRules: asArray<TaskAutomationRule>(data.automationRules),
    automationRuns: asArray<TaskAutomationRun>(data.automationRuns),
    tasks: asArray<Task>(data.tasks).map(normalizeTask),
    directions: asArray(data.directions),
    projects: asArray(data.projects),
    habits: asArray(data.habits),
    habitLogs: asArray(data.habitLogs),
    entries: asArray(data.entries),
    goals: asArray(data.goals),
    sessions: asArray(data.sessions),
    activeTimer: data.activeTimer ?? null,
    settings: data.settings,
  }
}

function migrateV1ToV2(data: Persisted): Persisted {
  const settings = data.settings ?? ({} as Persisted["settings"])
  const taskStatuses =
    settings.taskStatuses && settings.taskStatuses.length > 0
      ? settings.taskStatuses
      : builtinStatusCatalog(settings.taskStatusLabels)
  const taskPriorities =
    settings.taskPriorities && settings.taskPriorities.length > 0
      ? settings.taskPriorities
      : builtinPriorityCatalog(settings.taskPriorityLabels)
  return {
    ...data,
    schemaVersion: 2,
    settings: {
      ...settings,
      taskStatuses,
      taskPriorities,
    },
  }
}

const MIGRATIONS: Array<{
  from: number
  to: number
  run: (data: Persisted) => Persisted
}> = [
  { from: 0, to: 1, run: migrateV0ToV1 },
  { from: 1, to: 2, run: migrateV1ToV2 },
]

function takeSnapshot(raw: unknown): boolean {
  if (typeof localStorage === "undefined") return false
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      fromVersion: detectVersion(raw as Partial<Persisted>),
      data: raw,
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function readMigrationSnapshot(): {
  savedAt: string
  fromVersion: number
  data: unknown
} | null {
  if (typeof localStorage === "undefined") return null
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: string; fromVersion: number; data: unknown }
    if (!parsed || typeof parsed !== "object") return null
    return parsed
  } catch {
    return null
  }
}

export function clearMigrationSnapshot(): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    // ignore
  }
}

export function migratePersistedData(
  raw: Partial<Persisted> | null | undefined,
): MigrationResult {
  const fromVersion = detectVersion(raw)
  let data = { ...(raw ?? {}) } as Persisted
  let version = fromVersion
  let snapshotTaken = false

  if (version >= CURRENT_SCHEMA_VERSION) {
    return {
      data: {
        ...data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        automationRules: asArray(data.automationRules),
        automationRuns: asArray(data.automationRuns),
      },
      fromVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      migrated: false,
      snapshotTaken: false,
    }
  }

  for (const step of MIGRATIONS) {
    if (version !== step.from) continue
    if (version >= CURRENT_SCHEMA_VERSION) break
    if (!snapshotTaken) {
      snapshotTaken = takeSnapshot(raw)
    }
    data = step.run(data)
    version = step.to
  }

  if (version < CURRENT_SCHEMA_VERSION) {
    if (!snapshotTaken) snapshotTaken = takeSnapshot(raw)
    if (version < 1) {
      data = migrateV0ToV1(data)
      version = 1
    }
    if (version < 2) {
      data = migrateV1ToV2(data)
      version = 2
    }
    version = CURRENT_SCHEMA_VERSION
  }

  data = { ...data, schemaVersion: CURRENT_SCHEMA_VERSION }

  return {
    data,
    fromVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    migrated: fromVersion < CURRENT_SCHEMA_VERSION,
    snapshotTaken,
  }
}
