import test from "node:test"
import assert from "node:assert/strict"
import { createTaskFilterGroup, filterTasks, matchesTaskFilterGroup, type TaskFilterGroup } from "./task-filters.ts"
import type { Task } from "./types.ts"

const tasks: Task[] = [
  { id: "1", title: "Подготовить отчёт", status: "inbox", priority: "high", createdAt: "2026-11-01", updatedAt: "2026-11-02", dueDate: "2026-11-28", tags: ["работа", "важное"], projectId: "p1", estimatedMinutes: 60 },
  { id: "2", title: "Позвонить клиенту", status: "planned", priority: "low", createdAt: "2026-11-03", updatedAt: "2026-11-04", scheduledDate: "2026-11-27", tags: ["звонки"], dependsOn: ["1"] },
  { id: "3", title: "Купить продукты", status: "done", priority: "none", createdAt: "2026-11-05", updatedAt: "2026-11-06" },
]

test("empty filter group leaves all tasks visible", () => {
  assert.equal(filterTasks(tasks, createTaskFilterGroup()).length, 3)
})

test("AND group combines text, status and priority conditions", () => {
  const group: TaskFilterGroup = {
    id: "root", conjunction: "and", rules: [
      { id: "a", field: "title", operator: "contains", value: "отчёт" },
      { id: "b", field: "status", operator: "equals", value: "inbox" },
      { id: "c", field: "priority", operator: "equals", value: "high" },
    ],
  }
  assert.deepEqual(filterTasks(tasks, group).map((task) => task.id), ["1"])
})

test("nested OR groups work inside an AND group", () => {
  const group: TaskFilterGroup = {
    id: "root", conjunction: "and", rules: [
      { id: "a", field: "status", operator: "notEquals", value: "done" },
      { id: "nested", conjunction: "or", rules: [
        { id: "b", field: "priority", operator: "equals", value: "high" },
        { id: "c", field: "priority", operator: "equals", value: "low" },
      ] },
    ],
  }
  assert.deepEqual(filterTasks(tasks, group).map((task) => task.id), ["1", "2"])
})

test("supports empty, list, numeric and date operators", () => {
  const group: TaskFilterGroup = {
    id: "root", conjunction: "and", rules: [
      { id: "a", field: "tags", operator: "contains", value: "важ" },
      { id: "b", field: "estimatedMinutes", operator: "between", value: "30", secondValue: "90" },
      { id: "c", field: "dueDate", operator: "after", value: "2026-11-27" },
    ],
  }
  assert.deepEqual(filterTasks(tasks, group).map((task) => task.id), ["1"])
  assert.equal(matchesTaskFilterGroup(tasks[2], {
    id: "empty", conjunction: "and", rules: [{ id: "d", field: "dueDate", operator: "isEmpty" }],
  }, tasks), true)
})

test("blocked field resolves dependencies by task id", () => {
  const group: TaskFilterGroup = {
    id: "root", conjunction: "and", rules: [{ id: "a", field: "blocked", operator: "equals", value: "true" }],
  }
  assert.deepEqual(filterTasks(tasks, group).map((task) => task.id), ["2"])
})
