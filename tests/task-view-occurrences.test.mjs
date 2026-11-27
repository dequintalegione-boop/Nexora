import assert from "node:assert/strict"
import test from "node:test"
import { expandTasksForView, getTaskOccurrenceViewRange } from "../src/lib/nexora/task-view-occurrences.ts"

const task = (id, patch = {}) => ({
  id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  title: id,
  status: "planned",
  priority: "none",
  ...patch,
})

test("task view occurrence windows stay bounded and follow quick filters", () => {
  assert.deepEqual(getTaskOccurrenceViewRange("2026-01-15", "today"), {
    start: "2026-01-15",
    end: "2026-01-15",
  })
  assert.deepEqual(getTaskOccurrenceViewRange("2026-01-15", "week"), {
    start: "2026-01-15",
    end: "2026-01-22",
  })
  assert.deepEqual(getTaskOccurrenceViewRange("2026-01-15", "overdue"), {
    start: "2025-12-16",
    end: "2026-01-14",
  })
  assert.deepEqual(getTaskOccurrenceViewRange("2026-01-15", "all"), {
    start: "2025-12-16",
    end: "2026-02-14",
  })
  assert.deepEqual(getTaskOccurrenceViewRange("2026-01-15", "all", 7), {
    start: "2026-01-08",
    end: "2026-01-22",
  })
})

test("task views combine ordinary tasks with unique virtual and persisted recurrence instances", () => {
  const root = task("series", {
    scheduledDate: "2026-01-05",
    recurrenceStartDate: "2026-01-05",
    recurrenceStartScheduledDate: "2026-01-05",
    recurrenceRule: { frequency: "daily", interval: 1, count: 4 },
  })
  const saved = task("saved-2", {
    recurrenceParentId: "series",
    recurrenceOverride: true,
    occurrenceDate: "2026-01-06",
    occurrenceNumber: 2,
    scheduledDate: "2026-01-10",
  })
  const ordinary = task("ordinary", { scheduledDate: "2026-01-07" })
  const outside = task("saved-outside", {
    recurrenceParentId: "series",
    occurrenceDate: "2026-01-08",
    occurrenceNumber: 4,
    scheduledDate: "2026-02-20",
  })

  const items = expandTasksForView(
    [root, saved, outside, ordinary],
    { start: "2026-01-05", end: "2026-01-10" },
  )
  const seriesItems = items.filter((item) => item.recurrenceSeriesId === "series")

  assert.equal(items.filter((item) => item.id === "ordinary").length, 1)
  assert.equal(seriesItems.length, 4)
  assert.equal(seriesItems.filter((item) => item.occurrenceDate === "2026-01-05")[0]?.id, "series")
  assert.equal(seriesItems.filter((item) => item.occurrenceDate === "2026-01-06")[0]?.id, "saved-2")
  assert.equal(seriesItems.filter((item) => item.occurrenceDate === "2026-01-06")[0]?.virtualOccurrence, false)
  assert.equal(seriesItems.filter((item) => item.occurrenceDate === "2026-01-07")[0]?.virtualOccurrence, true)
  assert.equal(seriesItems.filter((item) => item.occurrenceDate === "2026-01-08")[0]?.virtualOccurrence, true)
  const savedOutside = items.find((item) => item.id === "saved-outside")
  assert.equal(savedOutside?.virtualOccurrence, false)
  assert.equal(savedOutside?.recurrenceSeriesId, "series")
  assert.equal(items.filter((item) => item.id === "series").length, 1)
})

test("task views keep the series master available when its first occurrence is outside the window", () => {
  const root = task("series", {
    scheduledDate: "2026-01-01",
    recurrenceStartDate: "2026-01-01",
    recurrenceStartScheduledDate: "2026-01-01",
    recurrenceRule: { frequency: "daily", interval: 1, count: 5 },
  })
  const items = expandTasksForView([root], { start: "2026-01-03", end: "2026-01-05" })

  assert.equal(items.filter((item) => item.id === "series").length, 1)
  assert.equal(items.filter((item) => item.virtualOccurrence).length, 3)
  assert.deepEqual(
    items.filter((item) => item.virtualOccurrence).map((item) => item.occurrenceDate).sort(),
    ["2026-01-03", "2026-01-04", "2026-01-05"],
  )
})
