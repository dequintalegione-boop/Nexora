import test from "node:test"
import assert from "node:assert/strict"
import { getCalendarCreatePatch, getCalendarDayDropPatch, getCalendarDropPatch, getCalendarResizePatch, getCalendarTaskTime, layoutCalendarEvents } from "./calendar.ts"
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

test("moving a timed task from the month view keeps its clock time", () => {
  assert.deepEqual(getCalendarDayDropPatch(task, "2026-11-29"), {
    scheduledDate: "2026-11-29",
    startAt: "2026-11-29T09:00",
    endAt: "2026-11-29T10:30",
    allDay: false,
  })
})



test("overlapping calendar events are laid out side by side", () => {
  const layout = layoutCalendarEvents([
    { id: "a", start: 9 * 60, end: 12 * 60 },
    { id: "b", start: 10 * 60, end: 11 * 60 },
    { id: "c", start: 11 * 60, end: 13 * 60 },
  ])
  assert.equal(layout.length, 3)
  assert.deepEqual(layout.map((item) => [item.id, item.column, item.columns]), [
    ["a", 0, 2],
    ["b", 1, 2],
    ["c", 1, 2],
  ])
})

test("three events which overlap at the same time receive three columns", () => {
  const layout = layoutCalendarEvents([
    { id: "a", start: 9 * 60, end: 11 * 60 },
    { id: "b", start: 9 * 60 + 15, end: 10 * 60 + 15 },
    { id: "c", start: 9 * 60 + 30, end: 10 * 60 + 30 },
  ])
  assert.deepEqual(layout.map((item) => item.columns), [3, 3, 3])
  layout.forEach((item, index) => assert.ok(Math.abs(item.leftPercent - [0, 100 / 3, 200 / 3][index]) < 1e-9))
})

test("adjacent calendar events can reuse the same full-width column", () => {
  const layout = layoutCalendarEvents([
    { id: "first", start: 8 * 60, end: 9 * 60 },
    { id: "second", start: 9 * 60, end: 10 * 60 },
  ])
  assert.deepEqual(layout.map((item) => [item.column, item.columns, item.widthPercent]), [
    [0, 1, 100],
    [0, 1, 100],
  ])
})

test("calendar create and resize patches preserve a minimum 15-minute duration", () => {
  assert.deepEqual(getCalendarCreatePatch("2026-11-28", 8 * 60 + 7), {
    scheduledDate: "2026-11-28",
    startAt: "2026-11-28T08:00",
    endAt: "2026-11-28T09:00",
    allDay: false,
  })
  assert.deepEqual(getCalendarResizePatch(task, "2026-11-28", 8 * 60, 8 * 60), {
    scheduledDate: "2026-11-28",
    startAt: "2026-11-28T08:00",
    endAt: "2026-11-28T08:15",
    allDay: false,
  })
})
