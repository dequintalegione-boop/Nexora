import test from "node:test"
import assert from "node:assert/strict"
import { matchesAutomationConditions, runTaskAutomations } from "./automations.ts"
import type { Task } from "./types.ts"
import type { TaskAutomationRule, AutomationConditionGroup } from "./automations.ts"

const task: Task = {
  id: "task-1",
  title: "Подготовить отчёт",
  status: "inbox",
  priority: "high",
  createdAt: "2026-11-27T08:00:00.000Z",
  updatedAt: "2026-11-27T08:00:00.000Z",
  tags: ["работа"],
  projectId: "project-1",
}

const rule = (patch: Partial<TaskAutomationRule>): TaskAutomationRule => ({
  id: "rule-1",
  name: "Правило",
  enabled: true,
  trigger: "task.created",
  conditions: [],
  action: { type: "set_priority", value: "critical" },
  createdAt: "2026-11-27T08:00:00.000Z",
  updatedAt: "2026-11-27T08:00:00.000Z",
  ...patch,
})

test("matches all supported condition fields (flat AND)", () => {
  assert.equal(
    matchesAutomationConditions(task, [
      { field: "status", operator: "is", value: "inbox" },
      { field: "priority", operator: "is", value: "high" },
      { field: "project", operator: "is", value: "project-1" },
      { field: "tag", operator: "contains", value: "работа" },
      { field: "title", operator: "contains", value: "ОТЧЁТ" },
    ]),
    true,
  )
  assert.equal(
    matchesAutomationConditions(task, [{ field: "tag", operator: "contains", value: "личное" }]),
    false,
  )
})

test("empty conditions always match", () => {
  assert.equal(matchesAutomationConditions(task, []), true)
})

test("nested AND group", () => {
  const group: AutomationConditionGroup = {
    operator: "and",
    conditions: [
      { field: "status", operator: "is", value: "inbox" },
      { field: "priority", operator: "is", value: "high" },
    ],
  }
  assert.equal(matchesAutomationConditions(task, [group]), true)

  const failing: AutomationConditionGroup = {
    operator: "and",
    conditions: [
      { field: "status", operator: "is", value: "inbox" },
      { field: "priority", operator: "is", value: "low" },
    ],
  }
  assert.equal(matchesAutomationConditions(task, [failing]), false)
})

test("nested OR group", () => {
  const group: AutomationConditionGroup = {
    operator: "or",
    conditions: [
      { field: "priority", operator: "is", value: "low" },
      { field: "priority", operator: "is", value: "high" },
    ],
  }
  assert.equal(matchesAutomationConditions(task, [group]), true)

  const failing: AutomationConditionGroup = {
    operator: "or",
    conditions: [
      { field: "priority", operator: "is", value: "low" },
      { field: "status", operator: "is", value: "done" },
    ],
  }
  assert.equal(matchesAutomationConditions(task, [failing]), false)
})

test("deeply nested AND + OR", () => {
  // (status == inbox AND (priority == high OR tag contains "работа"))
  const tree: AutomationConditionGroup = {
    operator: "and",
    conditions: [
      { field: "status", operator: "is", value: "inbox" },
      {
        operator: "or",
        conditions: [
          { field: "priority", operator: "is", value: "critical" },
          { field: "tag", operator: "contains", value: "работа" },
        ],
      },
    ],
  }
  assert.equal(matchesAutomationConditions(task, [tree]), true)

  const failingTree: AutomationConditionGroup = {
    operator: "and",
    conditions: [
      { field: "status", operator: "is", value: "inbox" },
      {
        operator: "or",
        conditions: [
          { field: "priority", operator: "is", value: "critical" },
          { field: "tag", operator: "contains", value: "личное" },
        ],
      },
    ],
  }
  assert.equal(matchesAutomationConditions(task, [failingTree]), false)
})

test("executes a matching rule and records a deterministic run id", () => {
  const result = runTaskAutomations([task], [rule({})], {
    type: "task.created",
    taskId: task.id,
    eventId: "event-1",
    occurredAt: "2026-11-27T09:00:00.000Z",
  })
  assert.equal(result.tasks[0].priority, "critical")
  assert.equal(result.runs[0].id, "event-1:rule-1")
  assert.equal(result.runs[0].result, "success")
})

test("does not execute disabled or non-matching rules", () => {
  const result = runTaskAutomations(
    [task],
    [
      rule({ enabled: false }),
      rule({ id: "rule-2", trigger: "task.completed" }),
      rule({ id: "rule-3", conditions: [{ field: "priority", operator: "is", value: "low" }] }),
    ],
    {
      type: "task.created",
      taskId: task.id,
      eventId: "event-2",
      occurredAt: "2026-11-27T09:00:00.000Z",
    },
  )
  assert.equal(result.tasks[0].priority, "high")
  assert.equal(result.runs.length, 1)
  assert.equal(result.runs[0].result, "skipped")
})

test("applies tag, project, and due date actions without mutating original task", () => {
  const result = runTaskAutomations(
    [task],
    [
      rule({ id: "tag", action: { type: "add_tag", value: "срочно" } }),
      rule({ id: "project", action: { type: "assign_project", value: "project-2" } }),
      rule({ id: "due", action: { type: "set_due_offset", days: 2 } }),
    ],
    {
      type: "task.created",
      taskId: task.id,
      eventId: "event-3",
      occurredAt: "2026-11-27T09:00:00.000Z",
    },
  )
  assert.deepEqual(result.tasks[0].tags, ["работа", "срочно"])
  assert.deepEqual(result.tasks[0].projectIds, ["project-1", "project-2"])
  assert.equal(result.tasks[0].dueDate, "2026-11-29")
  assert.deepEqual(task.tags, ["работа"])
})

test("rule with nested OR condition executes correctly", () => {
  const nestedRule = rule({
    id: "nested",
    conditions: [
      {
        operator: "or",
        conditions: [
          { field: "priority", operator: "is", value: "low" },
          { field: "tag", operator: "contains", value: "работа" },
        ],
      },
    ],
    action: { type: "set_status", value: "planned" },
  })
  const result = runTaskAutomations([task], [nestedRule], {
    type: "task.created",
    taskId: task.id,
    eventId: "event-4",
    occurredAt: "2026-11-27T09:00:00.000Z",
  })
  assert.equal(result.tasks[0].status, "planned")
  assert.equal(result.runs[0].result, "success")
})
