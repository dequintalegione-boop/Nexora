import type { Persisted } from "./types"
import { defaultSettings } from "./store"
import { isoDate } from "./dates"

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function buildSeed(): Persisted {
  const today = isoDate()
  const dirWork = id("dir")
  const dirHealth = id("dir")
  const projApp = id("proj")
  const projFit = id("proj")

  return {
    directions: [
      { id: dirWork, createdAt: today, updatedAt: today, title: "Работа", color: "accent", order: 0 },
      { id: dirHealth, createdAt: today, updatedAt: today, title: "Здоровье", color: "ok", order: 1 },
    ],
    projects: [
      { id: projApp, createdAt: today, updatedAt: today, title: "Nexora", status: "active", priority: "high", directionId: dirWork, progress: 40 },
      { id: projFit, createdAt: today, updatedAt: today, title: "Фитнес", status: "active", priority: "medium", directionId: dirHealth, progress: 20 },
    ],
    tasks: [
      { id: id("task"), createdAt: today, updatedAt: today, title: "Доделать дашборд", status: "in_progress", priority: "high", projectId: projApp, scheduledDate: today, estimatedMinutes: 45 },
      { id: id("task"), createdAt: today, updatedAt: today, title: "Написать тесты store", status: "planned", priority: "medium", projectId: projApp, scheduledDate: today },
      { id: id("task"), createdAt: today, updatedAt: today, title: "Тренировка 30 мин", status: "inbox", priority: "medium", projectId: projFit, dueDate: today },
      { id: id("task"), createdAt: today, updatedAt: today, title: "Прочитать главу книги", status: "inbox", priority: "low" },
    ],
    habits: [
      { id: id("hab"), createdAt: today, updatedAt: today, title: "Медитация", measurementType: "boolean", schedule: { days: [1,2,3,4,5,6,0] }, active: true },
      { id: id("hab"), createdAt: today, updatedAt: today, title: "Вода (стаканы)", measurementType: "number", unit: "стаканов", targetValue: 8, schedule: { days: [1,2,3,4,5,6,0] }, active: true },
      { id: id("hab"), createdAt: today, updatedAt: today, title: "Прогулка", measurementType: "duration", unit: "мин", targetValue: 30, schedule: { days: [1,2,3,4,5,6,0] }, active: true },
    ],
    habitLogs: [],
    entries: [],
    goals: [
      { id: id("goal"), createdAt: today, updatedAt: today, title: "Запустить Nexora v1", horizon: "monthly", status: "active", progress: 40 },
      { id: id("goal"), createdAt: today, updatedAt: today, title: "Бегать 5 км", horizon: "quarterly", status: "active", progress: 0 },
    ],
    sessions: [],
    activeTimer: null,
    automationRules: [],
    automationRuns: [],
    settings: {
      ...defaultSettings(),
      initialized: true,
      displayName: "",
    },
  }
}
