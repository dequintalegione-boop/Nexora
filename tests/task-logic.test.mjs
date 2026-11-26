import test from "node:test"
import assert from "node:assert/strict"
import {
  buildNextTaskOccurrence,
  canAddTaskDependency,
  canSetTaskParent,
  getDependencyState,
  getTaskChildren,
} from "../src/lib/nexora/task-logic.ts"

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
