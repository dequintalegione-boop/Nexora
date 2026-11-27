import test from "node:test"
import assert from "node:assert/strict"
import {
  CURRENT_SCHEMA_VERSION,
  clearMigrationSnapshot,
  migratePersistedData,
  readMigrationSnapshot,
} from "./migrate.ts"
import type { Persisted } from "./types.ts"

function minimalV0(): Partial<Persisted> {
  return {
    directions: [],
    projects: [],
    tasks: [
      {
        id: "t1",
        title: "Старая задача",
        status: "inbox",
        priority: "none",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        // missing dependsOn / history — migration should normalize
      } as Persisted["tasks"][number],
    ],
    habits: [],
    habitLogs: [],
    entries: [],
    goals: [],
    sessions: [],
    activeTimer: null,
    settings: {
      initialized: true,
      theme: "dark",
      accent: "#2dd4bf",
      displayName: "",
      weekStartsOn: 1,
      widgetOrder: [],
      hiddenWidgets: [],
      notificationsEnabled: false,
    },
  }
}

test("CURRENT_SCHEMA_VERSION is a positive integer", () => {
  assert.equal(typeof CURRENT_SCHEMA_VERSION, "number")
  assert.ok(CURRENT_SCHEMA_VERSION >= 1)
})

test("migrates version 0 profile to current schema", () => {
  clearMigrationSnapshot()
  const result = migratePersistedData(minimalV0())
  assert.equal(result.migrated, true)
  assert.equal(result.fromVersion, 0)
  assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION)
  assert.equal(result.data.schemaVersion, CURRENT_SCHEMA_VERSION)
  assert.ok(Array.isArray(result.data.automationRules))
  assert.ok(Array.isArray(result.data.automationRuns))
  assert.deepEqual(result.data.tasks[0].dependsOn, [])
  assert.ok(Array.isArray(result.data.tasks[0].history))
})

test("idempotent: already-current data is not re-migrated", () => {
  const once = migratePersistedData(minimalV0())
  const twice = migratePersistedData(once.data)
  assert.equal(twice.migrated, false)
  assert.equal(twice.fromVersion, CURRENT_SCHEMA_VERSION)
  assert.equal(twice.data.schemaVersion, CURRENT_SCHEMA_VERSION)
  assert.equal(twice.data.tasks[0].id, "t1")
  assert.equal(twice.data.tasks[0].title, "Старая задача")
})

test("round-trip: migrate → serialize → migrate preserves tasks", () => {
  const first = migratePersistedData(minimalV0())
  const serialized = JSON.parse(JSON.stringify(first.data)) as Persisted
  const second = migratePersistedData(serialized)
  assert.equal(second.migrated, false)
  assert.deepEqual(
    second.data.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    first.data.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  )
  assert.equal(second.data.schemaVersion, CURRENT_SCHEMA_VERSION)
})

test("null/undefined input yields empty current-schema shell", () => {
  const result = migratePersistedData(null)
  assert.equal(result.migrated, true)
  assert.equal(result.data.schemaVersion, CURRENT_SCHEMA_VERSION)
  assert.deepEqual(result.data.automationRules, [])
  assert.deepEqual(result.data.automationRuns, [])
})

test("snapshot helpers do not throw without localStorage writes in node", () => {
  clearMigrationSnapshot()
  const snap = readMigrationSnapshot()
  assert.equal(snap, null)
})
