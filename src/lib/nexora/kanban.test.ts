import test from "node:test"
import assert from "node:assert/strict"
import { getKanbanColumns, getKanbanDropPatch, getKanbanTaskColumnIds, KANBAN_NO_PROJECT } from "./kanban.ts"
import type { Project, Task } from "./types.ts"

const base: Task = {
  id: "task-1", title: "Задача", status: "planned", priority: "high",
  createdAt: "2026-11-01", updatedAt: "2026-11-01",
}
const projects: Project[] = [
  { id: "p1", title: "Первый проект", status: "active", priority: "medium", createdAt: "", updatedAt: "" },
  { id: "p2", title: "Второй проект", status: "active", priority: "low", createdAt: "", updatedAt: "" },
]
const statusLabels = { inbox: "Входящие", planned: "План", in_progress: "В работе", waiting: "Ожидает", done: "Готово", cancelled: "Отменено" }
const priorityLabels = { none: "Нет", low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический" }

test("groups tasks by status and priority", () => {
  assert.deepEqual(getKanbanTaskColumnIds(base, "status"), ["planned"])
  assert.deepEqual(getKanbanTaskColumnIds(base, "priority"), ["high"])
})

test("project grouping supports multiple projects and unassigned tasks", () => {
  assert.deepEqual(getKanbanTaskColumnIds({ ...base, projectIds: ["p1", "p2"] }, "project"), ["p1", "p2"])
  assert.deepEqual(getKanbanTaskColumnIds(base, "project"), [KANBAN_NO_PROJECT])
})

test("creates columns for selected grouping", () => {
  assert.equal(getKanbanColumns("status", projects, statusLabels, priorityLabels).length, 6)
  assert.equal(getKanbanColumns("priority", projects, statusLabels, priorityLabels).length, 5)
  assert.deepEqual(getKanbanColumns("project", projects, statusLabels, priorityLabels).map((item) => item.id), ["p1", "p2", KANBAN_NO_PROJECT])
})

test("drop changes the grouped task field", () => {
  assert.deepEqual(getKanbanDropPatch("status", "done"), { status: "done" })
  assert.deepEqual(getKanbanDropPatch("priority", "critical"), { priority: "critical" })
  assert.deepEqual(getKanbanDropPatch("project", "p2"), { projectId: "p2", projectIds: ["p2"] })
  assert.deepEqual(getKanbanDropPatch("project", KANBAN_NO_PROJECT), { projectId: undefined, projectIds: [] })
})
