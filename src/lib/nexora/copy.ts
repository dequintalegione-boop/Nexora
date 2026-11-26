import type { GoalStatus, Horizon, Priority, ProjectStatus, TaskStatus } from "./types"

export const WIDGETS = [
  { id: "progress", label: "Прогресс дня" },
  { id: "next", label: "Чем заняться?" },
  { id: "tasks", label: "Задачи на сегодня" },
  { id: "habits", label: "Привычки" },
  { id: "projects", label: "Проекты" },
  { id: "capture", label: "Быстрая запись" },
  { id: "week", label: "Неделя" },
] as const

export const STATUS_LABEL: Record<TaskStatus, string> = {
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

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "Без приоритета",
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
}

export const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "critical"]

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
