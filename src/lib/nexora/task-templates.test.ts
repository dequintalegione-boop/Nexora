import test from "node:test"
import assert from "node:assert/strict"
import { buildTaskInputFromTemplate, createTaskTemplateFromTask } from "./task-templates.ts"
import type { Task } from "./types.ts"

const task: Task = {
  id: "task-1",
  title: "Подготовить отчёт",
  description: "Собрать цифры и оформить",
  status: "in_progress",
  priority: "high",
  createdAt: "2026-11-27T08:00:00",
  updatedAt: "2026-11-27T08:00:00",
  dueDate: "2026-12-01",
  scheduledDate: "2026-11-28",
  projectId: "project-1",
  projectIds: ["project-1", "project-2"],
  recurrenceRule: { frequency: "weekly", interval: 2, weekdays: [1, 3] },
  estimatedMinutes: 90,
  tags: ["работа", "отчёт"],
  contexts: ["офис"],
  links: [{ id: "link-1", title: "Таблица", url: "https://example.com" }],
}

test("creates a reusable template without transient dates or task identity", () => {
  const template = createTaskTemplateFromTask(task, "  Еженедельный отчёт  ")
  assert.equal(template.name, "Еженедельный отчёт")
  assert.equal(template.title, task.title)
  assert.equal("id" in template, false)
  assert.equal("dueDate" in template, false)
  assert.equal("scheduledDate" in template, false)
  assert.deepEqual(template.tags, task.tags)
  assert.deepEqual(template.projectIds, task.projectIds)
  assert.deepEqual(template.recurrenceRule, task.recurrenceRule)
})

test("builds a fresh inbox task from a template without reusing mutable arrays", () => {
  const template = { ...createTaskTemplateFromTask(task, "Отчёт"), id: "template-1" }
  const input = buildTaskInputFromTemplate(template)
  assert.equal(input.status, "inbox")
  assert.equal(input.dueDate, undefined)
  assert.equal(input.scheduledDate, undefined)
  assert.deepEqual(input.projectIds, ["project-1"])
  assert.notEqual(input.tags, template.tags)
  assert.notEqual(input.links, template.links)
  assert.notEqual(input.projectIds, template.projectIds)
  assert.notEqual(input.recurrenceRule?.weekdays, template.recurrenceRule?.weekdays)
})
