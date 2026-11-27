import test from "node:test"
import assert from "node:assert/strict"
import { getCalendarDayDropPatch, getCalendarDropPatch, getCalendarTaskTime } from "./calendar.ts"
import type { Task } from "./types.ts"

const task: Task = {
  id: "task-1", title: "Задача", status: "planned", priority: "none",
  createdAt: "2026-11-27T00:00:00", updatedAt: "2026-11-27T00:00:00",
  startAt: "2026-11-27T09:00", endAt: "2026-11-27T10:30",
}

test("reads local task time", () => {
  assert.equal(getCalendarTaskTime(task), "09:00")
  assert.equal(getCalendarTaskTime({ ...task, startAt: undefined }), undefined)
})

test("moving a task preserves its duration and updates its date", () => {
  assert.deepEqual(getCalendarDropPatch(task, "2026-11-28", 11 * 60), {
    scheduledDate: "2026-11-28",
    startAt: "2026-11-28T11:00",
    endAt: "2026-11-28T12:30",
    allDay: false,
  })
})

test("tasks without a previous time receive a one-hour slot", () => {
  assert.deepEqual(getCalendarDropPatch({ ...task, startAt: undefined, endAt: undefined }, "2026-11-28", 8 * 60 + 30), {
    scheduledDate: "2026-11-28",
    startAt: "2026-11-28T08:30",
    endAt: "2026-11-28T09:30",
    allDay: false,
  })
})

test("moving a timed task from the month view keeps its clock time", async () => {
  const { getCalendarDayDropPatch } = await import("./calendar.ts")
  assert.deepEqual(getCalendarDayDropPatch(task, "2026-11-29"), {
    scheduledDate: "2026-11-29",
    startAt: "2026-11-29T09:00",
    endAt: "2026-11-29T10:30",
    allDay: false,
  })
})
