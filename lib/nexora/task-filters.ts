import type { Task } from "./types"

export type TaskFilterField =
  | "title"
  | "description"
  | "status"
  | "priority"
  | "dueDate"
  | "scheduledDate"
  | "projectId"
  | "tags"
  | "contexts"
  | "estimatedMinutes"
  | "actualMinutes"
  | "createdAt"
  | "updatedAt"
  | "blocked"

export type TaskFilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "isEmpty"
  | "isNotEmpty"
  | "greaterThan"
  | "lessThan"
  | "between"
  | "before"
  | "after"

export interface TaskFilterCondition {
  id: string
  field: TaskFilterField
  operator: TaskFilterOperator
  value?: string
  secondValue?: string
}

export interface TaskFilterGroup {
  id: string
  conjunction: "and" | "or"
  rules: Array<TaskFilterCondition | TaskFilterGroup>
}

export function isTaskFilterGroup(rule: TaskFilterCondition | TaskFilterGroup): rule is TaskFilterGroup {
  return "rules" in rule
}

function fieldValue(task: Task, field: TaskFilterField, tasks: Task[]): unknown {
  if (field === "projectId") return task.projectIds ?? (task.projectId ? [task.projectId] : [])
  if (field === "blocked") {
    const byId = new Map(tasks.map((item) => [item.id, item]))
    return (task.dependsOn ?? []).some((id) => {
      const dependency = byId.get(id)
      return !dependency || (dependency.status !== "done" && !dependency.deletedAt)
    })
  }
  return task[field]
}

function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0)
}

function compare(value: unknown, target: string): number {
  if (typeof value === "number") {
    const number = Number(target)
    return Number.isFinite(number) ? value - number : Number.NaN
  }
  return String(value ?? "").localeCompare(target, "ru", { numeric: true, sensitivity: "base" })
}

function matchesCondition(task: Task, condition: TaskFilterCondition, tasks: Task[]): boolean {
  const actual = fieldValue(task, condition.field, tasks)
  const expected = condition.value ?? ""
  const normalized = String(actual ?? "").toLocaleLowerCase("ru")
  const needle = expected.toLocaleLowerCase("ru")
  const list = Array.isArray(actual) ? actual.map(String) : []

  switch (condition.operator) {
    case "equals": return Array.isArray(actual) ? list.includes(expected) : normalized === needle
    case "notEquals": return Array.isArray(actual) ? !list.includes(expected) : normalized !== needle
    case "contains": return Array.isArray(actual) ? list.some((item) => item.toLocaleLowerCase("ru").includes(needle)) : normalized.includes(needle)
    case "notContains": return Array.isArray(actual) ? !list.some((item) => item.toLocaleLowerCase("ru").includes(needle)) : !normalized.includes(needle)
    case "isEmpty": return isEmpty(actual)
    case "isNotEmpty": return !isEmpty(actual)
    case "greaterThan": return !isEmpty(actual) && !Number.isNaN(compare(actual, expected)) && compare(actual, expected) > 0
    case "lessThan": return !isEmpty(actual) && !Number.isNaN(compare(actual, expected)) && compare(actual, expected) < 0
    case "between": {
      const upper = condition.secondValue ?? ""
      return !isEmpty(actual) && !Number.isNaN(compare(actual, expected)) && !Number.isNaN(compare(actual, upper)) &&
        compare(actual, expected) >= 0 && compare(actual, upper) <= 0
    }
    case "before": return !isEmpty(actual) && String(actual) < expected
    case "after": return !isEmpty(actual) && String(actual) > expected
  }
}

export function matchesTaskFilterGroup(task: Task, group: TaskFilterGroup, tasks: Task[]): boolean {
  if (group.rules.length === 0) return group.conjunction === "and"
  const results = group.rules.map((rule) =>
    isTaskFilterGroup(rule)
      ? matchesTaskFilterGroup(task, rule, tasks)
      : matchesCondition(task, rule, tasks)
  )
  return group.conjunction === "or" ? results.some(Boolean) : results.every(Boolean)
}

export function filterTasks(tasks: Task[], group?: TaskFilterGroup): Task[] {
  if (!group || group.rules.length === 0) return tasks
  return tasks.filter((task) => matchesTaskFilterGroup(task, group, tasks))
}

export function createTaskFilterGroup(): TaskFilterGroup {
  return { id: `group_${Math.random().toString(36).slice(2, 9)}`, conjunction: "and", rules: [] }
}

export function createTaskFilterCondition(): TaskFilterCondition {
  return { id: `rule_${Math.random().toString(36).slice(2, 9)}`, field: "status", operator: "equals", value: "inbox" }
}

export const TASK_FILTER_FIELDS: Array<{ value: TaskFilterField; label: string }> = [
  { value: "title", label: "Название" },
  { value: "description", label: "Описание" },
  { value: "status", label: "Статус" },
  { value: "priority", label: "Приоритет" },
  { value: "dueDate", label: "Срок" },
  { value: "scheduledDate", label: "Запланировано" },
  { value: "projectId", label: "Проект" },
  { value: "tags", label: "Метки" },
  { value: "contexts", label: "Контекст" },
  { value: "estimatedMinutes", label: "Оценка, мин" },
  { value: "actualMinutes", label: "Факт, мин" },
  { value: "createdAt", label: "Создано" },
  { value: "updatedAt", label: "Изменено" },
  { value: "blocked", label: "Заблокирована" },
]

export const TASK_FILTER_OPERATORS: Array<{ value: TaskFilterOperator; label: string }> = [
  { value: "equals", label: "равно" },
  { value: "notEquals", label: "не равно" },
  { value: "contains", label: "содержит" },
  { value: "notContains", label: "не содержит" },
  { value: "isEmpty", label: "пусто" },
  { value: "isNotEmpty", label: "не пусто" },
  { value: "greaterThan", label: "больше" },
  { value: "lessThan", label: "меньше" },
  { value: "between", label: "между" },
  { value: "before", label: "до" },
  { value: "after", label: "после" },
]
