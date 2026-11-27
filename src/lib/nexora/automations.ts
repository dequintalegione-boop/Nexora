import type { Priority, Task, TaskStatus } from "./types"

export type AutomationTrigger = "task.created" | "task.status_changed" | "task.completed"

/** Leaf condition (single field check) */
export type AutomationConditionLeaf =
  | { field: "status"; operator: "is"; value: TaskStatus }
  | { field: "priority"; operator: "is"; value: Priority }
  | { field: "project"; operator: "is"; value: string }
  | { field: "tag"; operator: "contains"; value: string }
  | { field: "title"; operator: "contains"; value: string }

/** Nested group of conditions with AND / OR */
export interface AutomationConditionGroup {
  operator: "and" | "or"
  conditions: AutomationConditionNode[]
}

/** Any node in the condition tree */
export type AutomationConditionNode = AutomationConditionLeaf | AutomationConditionGroup

/** Backward-compatible alias: flat array of leaves is treated as an AND group */
export type AutomationCondition = AutomationConditionLeaf

export type AutomationAction =
  | { type: "set_status"; value: TaskStatus }
  | { type: "set_priority"; value: Priority }
  | { type: "assign_project"; value: string }
  | { type: "add_tag"; value: string }
  | { type: "remove_tag"; value: string }
  | { type: "set_due_offset"; days: number }

export interface TaskAutomationRule {
  id: string
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  /**
   * Condition tree. For backward compatibility a flat array of leaves
   * is accepted and interpreted as an AND group.
   */
  conditions: AutomationConditionNode[] | AutomationConditionLeaf[]
  action: AutomationAction
  createdAt: string
  updatedAt: string
}

export interface TaskAutomationRun {
  id: string
  ruleId: string
  taskId: string
  trigger: AutomationTrigger
  executedAt: string
  result: "success" | "skipped"
  message: string
}

export interface AutomationEvent {
  type: AutomationTrigger
  taskId: string
  eventId: string
  occurredAt: string
}

export interface AutomationResult {
  tasks: Task[]
  runs: TaskAutomationRun[]
}

function isConditionGroup(node: AutomationConditionNode): node is AutomationConditionGroup {
  return "operator" in node && Array.isArray((node as AutomationConditionGroup).conditions)
}

function matchLeaf(task: Task, condition: AutomationConditionLeaf): boolean {
  switch (condition.field) {
    case "status":
      return task.status === condition.value
    case "priority":
      return task.priority === condition.value
    case "project":
      return task.projectId === condition.value || task.projectIds?.includes(condition.value) === true
    case "tag":
      return task.tags?.includes(condition.value) === true
    case "title":
      return task.title.toLocaleLowerCase().includes(condition.value.toLocaleLowerCase())
  }
}

/**
 * Evaluate a condition tree against a task.
 * - Flat array of leaves → treated as AND
 * - Explicit group with operator "and" / "or" → recursive evaluation
 */
export function matchesAutomationConditions(
  task: Task,
  conditions: AutomationConditionNode[] | AutomationConditionLeaf[],
): boolean {
  if (conditions.length === 0) return true

  // Detect whether the top-level is already a single group or a flat list of leaves
  const first = conditions[0]
  if (conditions.length === 1 && isConditionGroup(first)) {
    return evaluateNode(task, first)
  }

  // Flat list of leaves (or mixed, but we treat top-level as AND for compatibility)
  return conditions.every((node) => evaluateNode(task, node as AutomationConditionNode))
}

function evaluateNode(task: Task, node: AutomationConditionNode): boolean {
  if (isConditionGroup(node)) {
    if (node.conditions.length === 0) return true
    if (node.operator === "or") {
      return node.conditions.some((child) => evaluateNode(task, child))
    }
    // "and"
    return node.conditions.every((child) => evaluateNode(task, child))
  }
  return matchLeaf(task, node)
}

function applyAction(task: Task, action: AutomationAction, now: string): Task {
  switch (action.type) {
    case "set_status":
      return { ...task, status: action.value, completedAt: action.value === "done" ? now : undefined }
    case "set_priority":
      return { ...task, priority: action.value }
    case "assign_project": {
      const projectIds = [...new Set([...(task.projectIds ?? (task.projectId ? [task.projectId] : [])), action.value])]
      return { ...task, projectId: action.value, projectIds }
    }
    case "add_tag":
      return { ...task, tags: [...new Set([...(task.tags ?? []), action.value])] }
    case "remove_tag":
      return { ...task, tags: (task.tags ?? []).filter((tag) => tag !== action.value) }
    case "set_due_offset": {
      const due = new Date(now)
      due.setUTCDate(due.getUTCDate() + action.days)
      return { ...task, dueDate: due.toISOString().slice(0, 10) }
    }
  }
}

export function runTaskAutomations(
  tasks: Task[],
  rules: TaskAutomationRule[],
  event: AutomationEvent,
): AutomationResult {
  const taskIndex = tasks.findIndex((task) => task.id === event.taskId)
  if (taskIndex < 0) return { tasks, runs: [] }

  let nextTask = tasks[taskIndex]
  const runs: TaskAutomationRun[] = []
  const now = event.occurredAt

  for (const rule of rules) {
    if (!rule.enabled || rule.trigger !== event.type) continue
    const matches = matchesAutomationConditions(nextTask, rule.conditions)
    const runId = `${event.eventId}:${rule.id}`
    if (!matches) {
      runs.push({
        id: runId,
        ruleId: rule.id,
        taskId: event.taskId,
        trigger: event.type,
        executedAt: now,
        result: "skipped",
        message: "Условия не выполнены",
      })
      continue
    }
    nextTask = { ...applyAction(nextTask, rule.action, now), updatedAt: now }
    runs.push({
      id: runId,
      ruleId: rule.id,
      taskId: event.taskId,
      trigger: event.type,
      executedAt: now,
      result: "success",
      message: "Действие выполнено",
    })
  }

  if (runs.some((run) => run.result === "success")) {
    const nextTasks = [...tasks]
    nextTasks[taskIndex] = nextTask
    return { tasks: nextTasks, runs }
  }
  return { tasks, runs }
}
