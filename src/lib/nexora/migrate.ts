import type { Persisted, Task } from "./types"
import type { TaskAutomationRule, TaskAutomationRun } from "./automations"

/** Current on-disk schema version for the Zustand persisted profile. */
export const CURRENT_SCHEMA_VERSION = 1

const SNAPSHOT_KEY = "nexora-migration-snapshot"

export interface MigrationResult {
  data: Persisted
  fromVersion: number
  toVersion: number
  migrated: boolean
  snapshotTaken: boolean
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

/**
 * v0 → v1: ensure automation collections exist, normalize task array fields,
 * stamp schemaVersion.
 */
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

const MIGRATIONS: Array<{
  from: number
  to: number
  run: (data: Persisted) => Persisted
}> = [
  { from: 0, to: 1, run: migrateV0ToV1 },
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
    // Quota or private mode — migration still proceeds; caller can rely on export backup.
    return false
  }
}

/**
 * Read the last pre-migration snapshot if present.
 * Useful for recovery UI or tests.
 */
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

/**
 * Apply sequential schema migrations until CURRENT_SCHEMA_VERSION.
 * Idempotent: already-current data is returned unchanged with migrated=false.
 * Takes a localStorage snapshot before the first actual migration step.
 */
export function migratePersistedData(
  raw: Partial<Persisted> | null | undefined,
): MigrationResult {
  const fromVersion = detectVersion(raw)
  let data = { ...(raw ?? {}) } as Persisted
  let version = fromVersion
  let snapshotTaken = false

  if (version >= CURRENT_SCHEMA_VERSION) {
    // Still normalize optional arrays for safety without rewriting version.
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

  // If somehow still behind, stamp current version after best-effort normalization.
  if (version < CURRENT_SCHEMA_VERSION) {
    if (!snapshotTaken) snapshotTaken = takeSnapshot(raw)
    data = migrateV0ToV1(data)
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
