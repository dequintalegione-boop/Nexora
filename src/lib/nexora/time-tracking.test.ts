import test from "node:test"
import assert from "node:assert/strict"
import { correctTimeSession } from "./time-tracking.ts"

const session = {
  id: "session-1",
  createdAt: "2026-11-27T09:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
  kind: "focus" as const,
  startedAt: "2026-11-27T09:00:00.000Z",
  endedAt: "2026-11-27T10:00:00.000Z",
  taskId: "task-1",
  title: "Работа над Nexora",
  durationMinutes: 60,
}

test("corrects session timestamps, derives duration and preserves task links", () => {
  const result = correctTimeSession(
    [session],
    "session-1",
    {
      startedAt: "2026-11-27T09:15:00.000Z",
      endedAt: "2026-11-27T10:45:00.000Z",
      title: "Исправленная сессия",
    },
    "2026-11-27T11:00:00.000Z",
  )
  assert.ok(result)
  assert.equal(result.updated.durationMinutes, 90)
  assert.equal(result.updated.taskId, "task-1")
  assert.equal(result.updated.title, "Исправленная сессия")
  assert.equal(result.updated.updatedAt, "2026-11-27T11:00:00.000Z")
  assert.equal(session.durationMinutes, 60)
})

test("rejects a missing session and an end time before the start", () => {
  assert.equal(correctTimeSession([session], "missing", {}, "2026-11-27T11:00:00.000Z"), null)
  assert.equal(
    correctTimeSession(
      [session],
      "session-1",
      { startedAt: "2026-11-27T11:00:00.000Z" },
      "2026-11-27T11:00:00.000Z",
    ),
    null,
  )
})
