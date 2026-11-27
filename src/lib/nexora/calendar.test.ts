import test from "node:test"
import assert from "node:assert/strict"
import { getAgendaLoadIncrement, getCalendarCreatePatch, getCalendarDayActivity, getCalendarDayDropPatch, getCalendarDropMinutes, getCalendarFitPixelsPerHour, getCalendarDropPatch, getCalendarResizePatch, getCalendarSelectionRange, getCalendarSessionRange, getCalendarTaskTime, layoutCalendarEvents } from "./calendar.ts"
import type { Task, TimeSession } from "./types.ts"

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


test("drag selection includes every half-hour slot in either direction and respects grid bounds", () => {
  assert.deepEqual(getCalendarSelectionRange(10 * 60, 2, 30, 6 * 60, 22 * 60), {
    start: 10 * 60,
    end: 11 * 60 + 30,
  })
  assert.deepEqual(getCalendarSelectionRange(10 * 60, -2, 30, 6 * 60, 22 * 60), {
    start: 9 * 60,
    end: 10 * 60 + 30,
  })
  assert.deepEqual(getCalendarSelectionRange(21 * 60 + 30, 9, 30, 6 * 60, 22 * 60), {
    start: 21 * 60 + 30,
    end: 22 * 60,
  })
})


test("quarter-hour snap supports precise selection and drop positions", () => {
  assert.deepEqual(getCalendarSelectionRange(9 * 60, 2, 15, 6 * 60, 22 * 60), {
    start: 9 * 60,
    end: 9 * 60 + 45,
  })
  assert.deepEqual(getCalendarSelectionRange(9 * 60, -2, 15, 6 * 60, 22 * 60), {
    start: 8 * 60 + 30,
    end: 9 * 60 + 15,
  })
  assert.equal(getCalendarDropMinutes(293, 100, 440, 6 * 60, 10 * 60, 15), 7 * 60 + 45)
  assert.equal(getCalendarDropMinutes(320, 100, 440, 6 * 60, 10 * 60, 60), 8 * 60)
})


test("fit-to-window computes a readable hour height from the available planner viewport", () => {
  assert.equal(getCalendarFitPixelsPerHour(656, 82, 6, 22), 35)
  assert.equal(getCalendarFitPixelsPerHour(240, 82, 6, 22), null)
  assert.equal(getCalendarFitPixelsPerHour(4000, 100, 6, 22), 243)
  assert.equal(getCalendarFitPixelsPerHour(402, 82, 6, 22), 20)
  assert.equal(getCalendarFitPixelsPerHour(656, 82, 22, 6), null)
})

test("completed time sessions are clipped to their local calendar day", () => {
  const session: TimeSession = {
    id: "session-1",
    createdAt: "2026-11-27T00:00:00",
    updatedAt: "2026-11-27T00:00:00",
    kind: "focus",
    startedAt: "2026-11-27T23:30:00",
    endedAt: "2026-11-28T01:00:00",
    durationMinutes: 90,
    title: "Ночная сессия",
  }
  assert.deepEqual(getCalendarSessionRange(session, "2026-11-27"), { start: 23 * 60 + 30, end: 24 * 60 })
  assert.deepEqual(getCalendarSessionRange(session, "2026-11-28"), { start: 0, end: 60 })
  assert.equal(getCalendarSessionRange(session, "2026-11-29"), null)
})


test("touch drop positions resolve to half-hour slots even over event cards", () => {
  assert.equal(getCalendarDropMinutes(100, 100, 440, 6 * 60, 11 * 60), 6 * 60)
  assert.equal(getCalendarDropMinutes(320, 100, 440, 6 * 60, 11 * 60), 8 * 60 + 30)
  assert.equal(getCalendarDropMinutes(540, 100, 440, 6 * 60, 11 * 60), 10 * 60 + 30)
  assert.equal(getCalendarDropMinutes(540, 100, 0, 6 * 60, 11 * 60), null)
})


test("mini calendar activity separates planned tasks, deadlines, completions and time blocks", () => {
  const tasks: Task[] = [
    { ...task, id: "scheduled", scheduledDate: "2026-11-28", startAt: "2026-11-28T09:00", endAt: "2026-11-28T10:00" },
    { ...task, id: "due", scheduledDate: undefined, startAt: undefined, endAt: undefined, dueDate: "2026-11-28" },
    { ...task, id: "completed", scheduledDate: undefined, startAt: undefined, endAt: undefined, status: "done", completedAt: "2026-11-29T11:00" },
    { ...task, id: "done-fallback", scheduledDate: undefined, startAt: undefined, endAt: undefined, status: "done", completedAt: undefined, updatedAt: "2026-11-29T12:00" },
    { ...task, id: "archived", scheduledDate: "2026-11-28", archived: true },
  ]
  const sessions: TimeSession[] = [
    {
      id: "session-cross-midnight",
      createdAt: "2026-11-28T00:00:00",
      updatedAt: "2026-11-28T00:00:00",
      kind: "focus",
      startedAt: "2026-11-28T23:30:00",
      endedAt: "2026-11-29T00:30:00",
      durationMinutes: 60,
    },
  ]
  const activity = getCalendarDayActivity(tasks, sessions, ["2026-11-28", "2026-11-29"], (status) => status === "done")

  assert.deepEqual(activity.get("2026-11-28"), {
    scheduled: 1,
    deadlines: 1,
    completed: 0,
    timeBlocks: 1,
    sessions: 1,
  })
  assert.deepEqual(activity.get("2026-11-29"), {
    scheduled: 0,
    deadlines: 0,
    completed: 2,
    timeBlocks: 0,
    sessions: 1,
  })
})

test("mini calendar activity de-duplicates tasks and ignores dates outside the displayed month", () => {
  const duplicate = { ...task, id: "same-task", scheduledDate: "2026-11-28" }
  const activity = getCalendarDayActivity(
    [duplicate, duplicate, { ...task, id: "outside", dueDate: "2026-12-01" }],
    [],
    ["2026-11-28"],
    () => false,
  )
  assert.deepEqual(activity.get("2026-11-28"), {
    scheduled: 1,
    deadlines: 0,
    completed: 0,
    timeBlocks: 0,
    sessions: 0,
  })
})


test("agenda chunk loading adds seven days but never exceeds the 365-day window", () => {
  assert.equal(getAgendaLoadIncrement(0), 7)
  assert.equal(getAgendaLoadIncrement(358), 7)
  assert.equal(getAgendaLoadIncrement(364), 1)
  assert.equal(getAgendaLoadIncrement(365), 0)
  assert.equal(getAgendaLoadIncrement(500), 0)
  assert.equal(getAgendaLoadIncrement(0, 10, 25), 10)
})
