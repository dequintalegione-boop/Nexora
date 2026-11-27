import type {
  GoalStatus,
  Horizon,
  Priority,
  PriorityDefinition,
  ProjectStatus,
  Settings,
  StatusDefinition,
  TaskStatus,
} from "./types"

export const WIDGETS = [
  { id: "progress", label: "Прогресс дня" },
  { id: "next", label: "Чем заняться?" },
  { id: "tasks", label: "Задачи на сегодня" },
  { id: "habits", label: "Привычки" },
  { id: "projects", label: "Проекты" },
  { id: "capture", label: "Быстрая запись" },
  { id: "week", label: "Неделя" },
] as const

export const STATUS_LABEL: Record<string, string> = {
  inbox: "Входящие",
  planned: "Запланирована",
  in_progress: "В процессе",
  waiting: "Ожидает",
  done: "Готово",
  cancelled: "Отменена",
}

export const TASK_STATUSES: TaskStatus[] = [
  "inbox",
  "planned",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
]

const STATUS_CATEGORY: Record<string, StatusDefinition["category"]> = {
  inbox: "open",
  planned: "open",
  in_progress: "open",
  waiting: "open",
  done: "done",
  cancelled: "cancelled",
}

export function defaultTaskStatuses(): StatusDefinition[] {
  return TASK_STATUSES.map((id, order) => ({
    id,
    label: STATUS_LABEL[id] ?? id,
    category: STATUS_CATEGORY[id] ?? "open",
    order,
    builtin: true,
  }))
}

export function getTaskStatusDefinitions(
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): StatusDefinition[] {
  if (settings?.taskStatuses && settings.taskStatuses.length > 0) {
    return [...settings.taskStatuses].sort((a, b) => a.order - b.order)
  }
  return defaultTaskStatuses().map((s) => ({
    ...s,
    label: settings?.taskStatusLabels?.[s.id]?.trim() || s.label,
  }))
}

export function getActiveTaskStatuses(
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): StatusDefinition[] {
  return getTaskStatusDefinitions(settings).filter((s) => !s.hidden)
}

export function getTaskStatusLabels(
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): Record<string, string> {
  const map: Record<string, string> = { ...STATUS_LABEL }
  for (const s of getTaskStatusDefinitions(settings)) {
    map[s.id] = s.label
  }
  return map
}

export function getStatusLabel(
  id: string,
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): string {
  return getTaskStatusLabels(settings)[id] ?? id
}

export function getStatusDefinition(
  id: string,
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): StatusDefinition | undefined {
  return getTaskStatusDefinitions(settings).find((s) => s.id === id)
}

export function isDoneStatus(
  id: string,
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): boolean {
  const def = getStatusDefinition(id, settings)
  if (def) return def.category === "done"
  return id === "done"
}

export function isCancelledStatus(
  id: string,
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): boolean {
  const def = getStatusDefinition(id, settings)
  if (def) return def.category === "cancelled"
  return id === "cancelled"
}

export function isOpenStatus(
  id: string,
  settings?: Pick<Settings, "taskStatuses" | "taskStatusLabels">,
): boolean {
  return !isDoneStatus(id, settings) && !isCancelledStatus(id, settings)
}

export const PRIORITY_LABEL: Record<string, string> = {
  none: "Без приоритета",
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
}

export const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "critical"]

export function defaultTaskPriorities(): PriorityDefinition[] {
  return PRIORITIES.map((id, order) => ({
    id,
    label: PRIORITY_LABEL[id] ?? id,
    order,
    builtin: true,
  }))
}

export function getTaskPriorityDefinitions(
  settings?: Pick<Settings, "taskPriorities" | "taskPriorityLabels">,
): PriorityDefinition[] {
  if (settings?.taskPriorities && settings.taskPriorities.length > 0) {
    return [...settings.taskPriorities].sort((a, b) => a.order - b.order)
  }
  return defaultTaskPriorities().map((p) => ({
    ...p,
    label: settings?.taskPriorityLabels?.[p.id]?.trim() || p.label,
  }))
}

export function getActiveTaskPriorities(
  settings?: Pick<Settings, "taskPriorities" | "taskPriorityLabels">,
): PriorityDefinition[] {
  return getTaskPriorityDefinitions(settings).filter((p) => !p.hidden)
}

export function getTaskPriorityLabels(
  settings?: Pick<Settings, "taskPriorities" | "taskPriorityLabels">,
): Record<string, string> {
  const map: Record<string, string> = { ...PRIORITY_LABEL }
  for (const p of getTaskPriorityDefinitions(settings)) {
    map[p.id] = p.label
  }
  return map
}

export const HORIZON_LABEL: Record<Horizon, string> = {
  daily: "День",
  weekly: "Неделя",
  monthly: "Месяц",
  quarterly: "Квартал",
  yearly: "Год",
  long_term: "Долгосрок",
}

export const HORIZONS: Horizon[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "long_term",
]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Активный",
  on_hold: "На паузе",
  completed: "Завершён",
  cancelled: "Отменён",
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Активна",
  completed: "Достигнута",
  abandoned: "Снята",
}

export const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]

export const ACCENTS = [
  { id: "teal", label: "Бирюза", value: "#2dd4bf" },
  { id: "blue", label: "Синий", value: "#60a5fa" },
  { id: "amber", label: "Янтарь", value: "#e7b15a" },
  { id: "rose", label: "Роза", value: "#fb7185" },
  { id: "ink", label: "Чернила", value: "#94a3b8" },
] as const

export const HABIT_ICON_NAMES = [
  "droplets",
  "footprints",
  "book-open",
  "brain",
  "dumbbell",
  "coffee",
  "moon",
  "pencil",
  "heart",
  "sun",
] as const
