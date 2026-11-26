import type { Priority, TaskStatus } from "./types"

export const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: "Входящие",
  planned: "Запланировано",
  in_progress: "В работе",
  waiting: "Ожидает",
  done: "Готово",
  cancelled: "Отменено",
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "Нет",
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
}

export const WIDGETS = [
  { id: "progress", title: "Прогресс дня" },
  { id: "habits", title: "Привычки" },
  { id: "tasks", title: "Задачи" },
  { id: "suggest", title: "Чем заняться?" },
  { id: "projects", title: "Проекты" },
  { id: "capture", title: "Быстрый захват" },
  { id: "goal", title: "Главная цель" },
  { id: "timer", title: "Таймер" },
] as const
