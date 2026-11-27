import test from "node:test"
import assert from "node:assert/strict"
import {
  defaultTaskStatuses,
  getActiveTaskStatuses,
  getTaskStatusDefinitions,
  isCancelledStatus,
  isDoneStatus,
  isOpenStatus,
} from "./copy.ts"
import type { Settings, StatusDefinition } from "./types.ts"

test("default catalog has six built-in statuses", () => {
  const defs = defaultTaskStatuses()
  assert.equal(defs.length, 6)
  assert.ok(defs.every((d) => d.builtin))
  assert.equal(defs.find((d) => d.id === "done")?.category, "done")
})

test("custom statuses appear in active list and affect done detection", () => {
  const custom: StatusDefinition[] = [
    ...defaultTaskStatuses(),
    { id: "custom_review", label: "На ревью", category: "open", order: 6, builtin: false },
    { id: "custom_shipped", label: "Отгружено", category: "done", order: 7, builtin: false },
  ]
  const settings = { taskStatuses: custom } as Settings
  const active = getActiveTaskStatuses(settings)
  assert.ok(active.some((s) => s.id === "custom_review"))
  assert.equal(isDoneStatus("custom_shipped", settings), true)
  assert.equal(isOpenStatus("custom_review", settings), true)
  assert.equal(isDoneStatus("done", settings), true)
  assert.equal(isCancelledStatus("cancelled", settings), true)
})

test("hidden statuses are excluded from active list but remain in definitions", () => {
  const defs = defaultTaskStatuses().map((s) =>
    s.id === "waiting" ? { ...s, hidden: true } : s,
  )
  const settings = { taskStatuses: defs } as Settings
  assert.ok(getTaskStatusDefinitions(settings).some((s) => s.id === "waiting"))
  assert.ok(!getActiveTaskStatuses(settings).some((s) => s.id === "waiting"))
})

test("legacy rename map still applied when catalog is absent", () => {
  const settings = {
    taskStatusLabels: { inbox: "Inbox", done: "Finished" },
  } as Settings
  const defs = getTaskStatusDefinitions(settings)
  assert.equal(defs.find((d) => d.id === "inbox")?.label, "Inbox")
  assert.equal(defs.find((d) => d.id === "done")?.label, "Finished")
})
