import type { Priority, Task, TaskStatus } from "./types"

export type AutomationTrigger = "task.created" | "task.status_changed" | "task.completed"
export type AutomationCondition =
  | { field: "status"; operator: "is"; value: TaskStatus }
  | { field: "priority"; operator: "is"; value: Priority }
  | { field: "project"; operator: "is"; value: string }
  | { field: "tag"; operator: "contains"; value: string }
  | { field: "title"; operator: "contains"; value: string }

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
  conditions: AutomationCondition[]
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

export function matchesAutomationConditions(task: Task, conditions: AutomationCondition[]): boolean {
  return conditions.every((condition) => {
    switch (condition.field) {
      case "status": return task.status === condition.value
      case "priority": return task.priority === condition.value
      case "project": return task.projectId === condition.value || task.projectIds?.includes(condition.value) === true
      case "tag": return task.tags?.includes(condition.value) === true
      case "title": return task.title.toLocaleLowerCase().includes(condition.value.toLocaleLowerCase())
    }
  })
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
      due.setDate(due.getDate() + action.days)
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
      runs.push({ id: runId, ruleId: rule.id, taskId: event.taskId, trigger: event.type, executedAt: now, result: "skipped", message: "Условия не выполнены" })
      continue
    }
    nextTask = { ...applyAction(nextTask, rule.action, now), updatedAt: now }
    runs.push({ id: runId, ruleId: rule.id, taskId: event.taskId, trigger: event.type, executedAt: now, result: "success", message: "Действие выполнено" })
  }

  if (runs.some((run) => run.result === "success")) {
    const nextTasks = [...tasks]
    nextTasks[taskIndex] = nextTask
    return { tasks: nextTasks, runs }
  }
  return { tasks, runs }
}
