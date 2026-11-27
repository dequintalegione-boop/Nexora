import test from "node:test"
import assert from "node:assert/strict"
import {
  buildNextTaskOccurrence,
  canAddTaskDependency,
  canSetTaskParent,
  getDependencyState,
  getTaskChildren,
  updateRecurrenceSeriesTasks,
} from "../src/lib/nexora/task-logic.ts"
import {
  expandTaskOccurrences,
  formatICalendarRecurrence,
  getNextRecurrenceOccurrence,
  getRecurrenceOccurrences,
  parseICalendarRecurrence,
} from "../src/lib/nexora/recurrence.ts"

const task = (id, patch = {}) => ({
  id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  title: id,
  status: "planned",
  priority: "none",
  ...patch,
})

test("dependency graph accepts an acyclic dependency", () => {
  const tasks = [task("a"), task("b")]
  assert.equal(canAddTaskDependency(tasks, "a", "b"), true)
})

test("dependency graph rejects direct and indirect cycles", () => {
  const direct = [task("a"), task("b", { dependsOn: ["a"] })]
  assert.equal(canAddTaskDependency(direct, "a", "b"), false)

  const indirect = [
    task("a"),
    task("b", { dependsOn: ["c"] }),
    task("c", { dependsOn: ["a"] }),
  ]
  assert.equal(canAddTaskDependency(indirect, "a", "b"), false)
})

test("parent hierarchy rejects self-parenting and descendant cycles", () => {
  const tasks = [
    task("root"),
    task("child", { parentId: "root" }),
    task("grandchild", { parentId: "child" }),
  ]
  assert.equal(canSetTaskParent(tasks, "root", "grandchild"), false)
  assert.equal(canSetTaskParent(tasks, "child", "child"), false)
  assert.equal(canSetTaskParent(tasks, "grandchild", "root"), true)
})

test("deleted dependencies are reported as broken links", () => {
  const current = task("current", { dependsOn: ["removed"] })
  const state = getDependencyState(current, [current, task("removed", { deletedAt: "2026-01-02T00:00:00.000Z" })])
  assert.equal(state.isBlocked, true)
  assert.deepEqual(state.missingDependencyIds, ["removed"])
})

test("child lookup excludes tasks in trash", () => {
  const tasks = [
    task("parent"),
    task("child", { parentId: "parent" }),
    task("trashed", { parentId: "parent", deletedAt: "2026-01-02T00:00:00.000Z" }),
  ]
  assert.deepEqual(getTaskChildren(tasks, "parent").map((item) => item.id), ["child"])
})

test("monthly recurrence keeps the original day after short months", () => {
  const first = task("series", {
    dueDate: "2026-01-31",
    recurrenceRule: { frequency: "monthly", interval: 1 },
  })
  const february = buildNextTaskOccurrence(first, "2026-01-31T12:00:00.000Z")
  assert.equal(february?.dueDate, "2026-02-28")

  const march = buildNextTaskOccurrence({ ...february, id: "february" }, "2026-02-28T12:00:00.000Z")
  assert.equal(march?.dueDate, "2026-03-31")
})

test("recurrence respects count and until limits", () => {
  const countLimited = task("limited", {
    occurrenceNumber: 2,
    recurrenceRule: { frequency: "daily", interval: 1, count: 2 },
  })
  assert.equal(buildNextTaskOccurrence(countLimited, "2026-01-02T12:00:00.000Z"), null)

  const dateLimited = task("until", {
    dueDate: "2026-01-10",
    recurrenceRule: { frequency: "daily", interval: 1, until: "2026-01-10" },
  })
  assert.equal(buildNextTaskOccurrence(dateLimited, "2026-01-10T12:00:00.000Z"), null)
})

test("weekly recurrence supports multiple selected weekdays", () => {
  const monday = task("series", {
    scheduledDate: "2026-01-05",
    recurrenceRule: { frequency: "weekly", interval: 1, weekdays: [1, 3, 5] },
  })
  const wednesday = buildNextTaskOccurrence(monday, "2026-01-05T12:00:00.000Z")
  assert.equal(wednesday?.occurrenceDate, "2026-01-07")
  assert.equal(wednesday?.scheduledDate, "2026-01-07")

  const friday = buildNextTaskOccurrence({ ...wednesday, id: "wednesday" }, "2026-01-07T12:00:00.000Z")
  assert.equal(friday?.occurrenceDate, "2026-01-09")

  const nextMonday = buildNextTaskOccurrence({ ...friday, id: "friday" }, "2026-01-09T12:00:00.000Z")
  assert.equal(nextMonday?.occurrenceDate, "2026-01-12")
})

test("weekly recurrence applies the interval to calendar weeks", () => {
  const first = task("series", {
    occurrenceDate: "2026-01-05",
    recurrenceRule: { frequency: "weekly", interval: 2, weekdays: [1, 3] },
  })
  const wednesday = buildNextTaskOccurrence(first, "2026-01-05T12:00:00.000Z")
  assert.equal(wednesday?.occurrenceDate, "2026-01-07")

  const nextCycle = buildNextTaskOccurrence({ ...wednesday, id: "wednesday" }, "2026-01-07T12:00:00.000Z")
  assert.equal(nextCycle?.occurrenceDate, "2026-01-19")
})

test("weekly recurrence ignores invalid weekday values and falls back safely", () => {
  const first = task("series", {
    occurrenceDate: "2026-01-05",
    recurrenceRule: { frequency: "weekly", interval: 1, weekdays: [8, -1] },
  })
  const next = buildNextTaskOccurrence(first, "2026-01-05T12:00:00.000Z")
  assert.equal(next?.occurrenceDate, "2026-01-12")
})

test("skipping an occurrence is carried forward to the next task in the series", () => {
  const first = task("series", {
    occurrenceDate: "2026-01-05",
    recurrenceRule: { frequency: "weekly", interval: 1, weekdays: [1, 3] },
    skippedOccurrences: ["2025-12-29"],
  })
  const next = buildNextTaskOccurrence(first, "2026-01-05T12:00:00.000Z")
  assert.equal(next?.occurrenceDate, "2026-01-07")
  assert.deepEqual(next?.skippedOccurrences, ["2025-12-29"])
})

test("weekly weekday recurrence shifts scheduled date and deadline by the actual day offset", () => {
  const first = task("series", {
    occurrenceDate: "2026-01-05",
    scheduledDate: "2026-01-05",
    dueDate: "2026-01-06",
    recurrenceRule: { frequency: "weekly", interval: 1, weekdays: [1, 3, 5] },
  })
  const next = buildNextTaskOccurrence(first, "2026-01-05T12:00:00.000Z")
  assert.equal(next?.occurrenceDate, "2026-01-07")
  assert.equal(next?.scheduledDate, "2026-01-07")
  assert.equal(next?.dueDate, "2026-01-08")
})

test("series rule updates affect the root and future active occurrences only", () => {
  const tasks = [
    task("root", { recurrenceRule: { frequency: "weekly", interval: 1 } }),
    task("future-a", { recurrenceParentId: "root", occurrenceNumber: 2 }),
    task("future-b", { recurrenceParentId: "root", occurrenceNumber: 3, status: "in_progress" }),
    task("completed", { recurrenceParentId: "root", occurrenceNumber: 1, status: "done" }),
    task("skipped", { recurrenceParentId: "root", occurrenceNumber: 4, status: "cancelled" }),
    task("archived", { recurrenceParentId: "root", occurrenceNumber: 5, archived: true }),
    task("other"),
  ]
  const rule = { frequency: "weekly", interval: 2, weekdays: [1, 3] }
  const result = updateRecurrenceSeriesTasks(tasks, "future-a", rule, "2026-01-10T12:00:00.000Z")

  assert.equal(result.updatedCount, 3)
  assert.deepEqual(result.tasks.find((item) => item.id === "root")?.recurrenceRule, rule)
  assert.deepEqual(result.tasks.find((item) => item.id === "future-a")?.recurrenceRule, rule)
  assert.deepEqual(result.tasks.find((item) => item.id === "future-b")?.recurrenceRule, rule)
  assert.equal(result.tasks.find((item) => item.id === "completed")?.recurrenceRule, undefined)
  assert.equal(result.tasks.find((item) => item.id === "skipped")?.recurrenceRule, undefined)
  assert.equal(result.tasks.find((item) => item.id === "archived")?.recurrenceRule, undefined)
  assert.equal(result.tasks.find((item) => item.id === "other")?.recurrenceRule, undefined)
})


test("monthly BYMONTHDAY supports multiple and negative month days", () => {
  const dates = getRecurrenceOccurrences(
    { frequency: "monthly", interval: 1, byMonthDay: [1, 15, -1] },
    "2026-01-01",
    "2026-01-01",
    "2026-03-31",
  ).map((item) => item.date)

  assert.deepEqual(dates, [
    "2026-01-01", "2026-01-15", "2026-01-31",
    "2026-02-01", "2026-02-15", "2026-02-28",
    "2026-03-01", "2026-03-15", "2026-03-31",
  ])
})

test("monthly BYDAY supports first weekday and last weekday selectors", () => {
  const dates = getRecurrenceOccurrences(
    {
      frequency: "monthly",
      interval: 1,
      byDay: [
        { weekday: 1, ordinal: 1 },
        { weekday: 5, ordinal: -1 },
      ],
    },
    "2026-01-01",
    "2026-01-01",
    "2026-03-31",
  ).map((item) => item.date)

  assert.deepEqual(dates, [
    "2026-01-01", "2026-01-05", "2026-01-30",
    "2026-02-02", "2026-02-27",
    "2026-03-02", "2026-03-27",
  ])
})


test("yearly BYMONTH preserves DTSTART day in each configured month", () => {
  const dates = getRecurrenceOccurrences(
    { frequency: "yearly", interval: 1, byMonth: [3, 9] },
    "2026-01-15",
    "2026-01-01",
    "2027-12-31",
  ).map((item) => item.date)

  assert.deepEqual(dates, [
    "2026-01-15",
    "2026-03-15",
    "2026-09-15",
    "2027-03-15",
    "2027-09-15",
  ])
})

test("iCalendar date-only parser rejects a time-bearing DTSTART", () => {
  assert.throws(
    () => parseICalendarRecurrence("DTSTART:20260101T090000\nRRULE:FREQ=DAILY"),
    /дата без времени/i,
  )
})

test("yearly BYMONTH and BYMONTHDAY select only configured months after DTSTART", () => {
  const dates = getRecurrenceOccurrences(
    {
      frequency: "yearly",
      interval: 1,
      byMonth: [3, 9],
      byMonthDay: [1],
    },
    "2026-01-01",
    "2026-01-01",
    "2027-12-31",
  ).map((item) => item.date)

  assert.deepEqual(dates, [
    "2026-01-01",
    "2026-03-01",
    "2026-09-01",
    "2027-03-01",
    "2027-09-01",
  ])
})

test("weekly BYDAY and WKST respect interval weeks", () => {
  const dates = getRecurrenceOccurrences(
    {
      frequency: "weekly",
      interval: 2,
      byDay: [{ weekday: 1 }, { weekday: 3 }],
      weekStart: 1,
    },
    "2026-01-05",
    "2026-01-05",
    "2026-01-31",
  ).map((item) => item.date)

  assert.deepEqual(dates, ["2026-01-05", "2026-01-07", "2026-01-19", "2026-01-21"])
})

test("COUNT counts rule occurrences before EXDATE exclusions", () => {
  const rule = {
    frequency: "daily",
    interval: 1,
    count: 3,
    excludeDates: ["2026-01-02"],
  }
  const dates = getRecurrenceOccurrences(
    rule,
    "2026-01-01",
    "2026-01-01",
    "2026-01-10",
  ).map((item) => item.date)

  assert.deepEqual(dates, ["2026-01-01", "2026-01-03"])
  assert.deepEqual(
    getNextRecurrenceOccurrence(rule, "2026-01-01", "2026-01-01"),
    { date: "2026-01-03", number: 3 },
  )
  assert.equal(getNextRecurrenceOccurrence(rule, "2026-01-01", "2026-01-03"), null)
})

test("iCalendar RRULE and EXDATE format round-trip", () => {
  const rule = {
    frequency: "monthly",
    interval: 2,
    byMonthDay: [1, 15, -1],
    byDay: [{ weekday: 1, ordinal: 1 }, { weekday: 5, ordinal: -1 }],
    count: 8,
    excludeDates: ["2026-06-01", "2026-04-15"],
  }
  const encoded = formatICalendarRecurrence(rule, "2026-01-01")
  const decoded = parseICalendarRecurrence(encoded)

  assert.equal(decoded.startDate, "2026-01-01")
  assert.equal(decoded.rule.frequency, rule.frequency)
  assert.equal(decoded.rule.interval, rule.interval)
  assert.deepEqual(decoded.rule.byMonthDay, rule.byMonthDay)
  assert.deepEqual(decoded.rule.byDay, rule.byDay)
  assert.equal(decoded.rule.count, 8)
  assert.deepEqual(decoded.rule.excludeDates, ["2026-04-15", "2026-06-01"])
})

test("iCalendar parser rejects unsupported RRULE fields instead of silently dropping them", () => {
  assert.throws(
    () => parseICalendarRecurrence("RRULE:FREQ=MONTHLY;BYSETPOS=1"),
    /не поддерживается/,
  )
})

test("next occurrence uses immutable DTSTART, ordinal BYDAY and EXDATE", () => {
  const first = task("monthly-series", {
    scheduledDate: "2026-01-05",
    occurrenceDate: "2026-01-05",
    occurrenceNumber: 1,
    recurrenceStartDate: "2026-01-05",
    recurrenceStartScheduledDate: "2026-01-05",
    startAt: "2026-01-05T09:00:00.000Z",
    endAt: "2026-01-05T10:30:00.000Z",
    recurrenceRule: {
      frequency: "monthly",
      interval: 1,
      byDay: [{ weekday: 1, ordinal: 1 }],
      excludeDates: ["2026-02-02"],
    },
  })
  const next = buildNextTaskOccurrence(first, "2026-01-05T12:00:00.000Z")
  assert.equal(next?.occurrenceDate, "2026-03-02")
  assert.equal(next?.occurrenceNumber, 3)
  assert.equal(next?.scheduledDate, "2026-03-02")
  assert.equal(next?.startAt, "2026-03-02T09:00:00.000Z")
  assert.equal(next?.endAt, "2026-03-02T10:30:00.000Z")
  assert.equal(next?.recurrenceStartStartAt, "2026-01-05T09:00:00.000Z")
  assert.equal(next?.recurrenceStartEndAt, "2026-01-05T10:30:00.000Z")
})

test("calendar expansion supports recurring tasks whose only date anchor is startAt", () => {
  const timed = task("timed-series", {
    startAt: "2026-02-01T09:30:00.000Z",
    endAt: "2026-02-01T10:30:00.000Z",
    recurrenceRule: { frequency: "daily", interval: 1, count: 2 },
  })
  const expanded = expandTaskOccurrences([timed], "2026-02-01", "2026-02-02")
  assert.deepEqual(expanded.map((item) => item.occurrenceDate), ["2026-02-01", "2026-02-02"])
  assert.equal(expanded[1]?.task.startAt, "2026-02-02T09:30:00.000Z")
})

test("calendar expansion returns virtual dates without materializing persisted tasks", () => {
  const root = task("series", {
    scheduledDate: "2026-01-01",
    startAt: "2026-01-01T09:00:00.000Z",
    endAt: "2026-01-01T10:00:00.000Z",
    recurrenceRule: {
      frequency: "daily",
      interval: 1,
      count: 5,
      excludeDates: ["2026-01-02", "2026-01-03"],
    },
  })
  const movedOccurrence = task("occurrence-2", {
    recurrenceParentId: "series",
    occurrenceDate: "2026-01-02",
    occurrenceNumber: 2,
    scheduledDate: "2026-01-04",
  })
  const expanded = expandTaskOccurrences(
    [root, movedOccurrence],
    "2026-01-01",
    "2026-01-05",
  )

  assert.deepEqual(expanded.map((item) => item.occurrenceDate), [
    "2026-01-01",
    "2026-01-02",
    "2026-01-04",
    "2026-01-05",
  ])
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-02")?.task.id, "occurrence-2")
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-02")?.isVirtual, false)
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-04")?.isVirtual, true)
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-04")?.task.scheduledDate, "2026-01-04")
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-05")?.task.id, "series::2026-01-05")
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-04")?.task.startAt, "2026-01-04T09:00:00.000Z")
  assert.equal(expanded.find((item) => item.occurrenceDate === "2026-01-04")?.task.endAt, "2026-01-04T10:00:00.000Z")
})
