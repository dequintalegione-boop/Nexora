import test from "node:test"
import assert from "node:assert/strict"
import { CURRENT_SCHEMA_VERSION } from "./migrate.ts"
import {
  createNexoraBackup,
  parseNexoraBackup,
  serializeNexoraBackup,
} from "./backup.ts"
import type { Persisted } from "./types.ts"
import type { BackupUIState } from "./backup.ts"

const sampleData: Persisted = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  directions: [
    { id: "direction-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", title: "Работа", color: "accent", order: 0 },
  ],
  projects: [
    { id: "project-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", title: "Nexora", description: "Разработка", status: "active", priority: "high", directionId: "direction-1" },
  ],
  tasks: [
    {
      id: "task-1",
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-02T10:00:00.000Z",
      title: "Проверить перенос данных",
      description: "Сохранить все поля задачи",
      status: "in_progress",
      priority: "critical",
      dueDate: "2026-02-01",
      scheduledDate: "2026-01-31",
      startAt: "2026-01-31T09:00:00.000Z",
      endAt: "2026-01-31T10:30:00.000Z",
      timezone: "Europe/Amsterdam",
      projectId: "project-1",
      projectIds: ["project-1"],
      directionId: "direction-1",
      parentId: "parent-1",
      dependsOn: ["dependency-1"],
      estimatedMinutes: 90,
      actualMinutes: 35,
      recurrenceRule: { frequency: "monthly", interval: 2, byDay: [{ weekday: 1, ordinal: 1 }, { weekday: 5, ordinal: -1 }], byMonthDay: [1, -1], byMonth: [1, 6], weekStart: 1, excludeDates: ["2026-03-17"], count: 8, until: "2026-06-01" },
      reminders: [{ id: "reminder-1", minutesBefore: 30, enabled: true, anchor: "due" }],
      links: [{ id: "link-1", title: "Документ", url: "https://example.com/doc" }],
      tags: ["данные"],
      contexts: ["компьютер"],
      history: [{ at: "2026-01-02T10:00:00.000Z", change: "Обновлено" }],
      skippedOccurrences: ["2026-01-17"],
      archived: true,
      archivedAt: "2026-01-20T10:00:00.000Z",
    },
  ],
  habits: [
    { id: "habit-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", title: "Чтение", measurementType: "number", unit: "страниц", targetValue: 20, schedule: { days: [1, 2, 3, 4, 5] }, active: true },
  ],
  habitLogs: [
    { id: "habit-log-1", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", habitId: "habit-1", date: "2026-01-02", value: 12 },
  ],
  entries: [
    { id: "entry-1", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", date: "2026-01-02", mood: 8, energy: 7, notes: "Заметка", reflection: { gratitude: "Семья" } },
  ],
  goals: [
    { id: "goal-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", title: "Запуск", horizon: "yearly", status: "active", progress: 35, projectIds: ["project-1"], directionId: "direction-1" },
  ],
  sessions: [
    { id: "session-1", createdAt: "2026-01-02T10:00:00.000Z", updatedAt: "2026-01-02T10:00:00.000Z", kind: "focus", startedAt: "2026-01-02T09:00:00.000Z", endedAt: "2026-01-02T10:00:00.000Z", taskId: "task-1", durationMinutes: 60 },
  ],
  activeTimer: { kind: "focus", startedAt: "2026-01-02T10:00:00.000Z", sessionStartedAt: "2026-01-02T09:30:00.000Z", taskId: "task-1", accumulatedMs: 1800000 },
  settings: {
    initialized: true,
    theme: "dark",
    accent: "#3ddc97",
    displayName: "Nexora user",
    weekStartsOn: 1,
    widgetOrder: ["tasks", "habits"],
    hiddenWidgets: ["goals"],
    notificationsEnabled: true,
    pomodoro: { focusMinutes: 30, shortBreakMinutes: 7, longBreakMinutes: 20, cyclesBeforeLongBreak: 3, autoStartNext: true },
    taskStatuses: [{ id: "custom_review", label: "На проверке", category: "open", order: 6, builtin: false }],
    taskPriorities: [{ id: "custom_urgent", label: "Срочно", order: 5, builtin: false }],
  },
  automationRules: [],
  automationRuns: [],
}

const sampleUI: BackupUIState = {
  savedTaskViews: [
    {
      id: "view-1",
      name: "На этой неделе",
      filter: "all",
      priorityFilter: "all",
      projectFilter: "all",
      sortBy: "due",
      quickFilter: "week",
      search: "",
      layout: "table",
      columns: ["title", "status", "dueDate"],
      kanbanGroupBy: "status",
    },
  ],
  taskTableColumns: ["title", "status", "priority", "dueDate", "scheduledDate"],
  kanbanGroupBy: "project",
  taskTemplates: [
    {
      id: "template-1",
      name: "Новая функция",
      title: "Реализовать функцию",
      priority: "high",
      estimatedMinutes: 120,
      projectIds: ["project-1"],
      recurrenceRule: { frequency: "weekly", interval: 1, weekdays: [1] },
      tags: ["разработка"],
      contexts: ["компьютер"],
      links: [{ id: "template-link-1", title: "ТЗ", url: "https://example.com/spec" }],
    },
  ],
}

test("versioned JSON backup round-trips all profile collections and task UI preferences", () => {
  const backup = createNexoraBackup(sampleData, sampleUI, "2026-11-27T12:00:00.000Z")
  const parsed = parseNexoraBackup(serializeNexoraBackup(backup))

  assert.equal(parsed.isLegacy, false)
  assert.equal(parsed.exportedAt, "2026-11-27T12:00:00.000Z")
  assert.deepEqual(parsed.data, sampleData)
  assert.deepEqual(parsed.ui, sampleUI)
  assert.deepEqual(parsed.warnings, [])
})

test("imports the previous flat JSON backup format", () => {
  const legacy = {
    schema: CURRENT_SCHEMA_VERSION,
    exportedAt: "2026-11-26T12:00:00.000Z",
    ...sampleData,
  } as Record<string, unknown>
  delete legacy.schemaVersion

  const parsed = parseNexoraBackup(JSON.stringify(legacy))
  assert.equal(parsed.isLegacy, true)
  assert.equal(parsed.data.schemaVersion, CURRENT_SCHEMA_VERSION)
  assert.deepEqual(parsed.data.tasks, sampleData.tasks)
  assert.equal(parsed.ui, undefined)
  assert.ok(parsed.warnings.some((warning) => warning.includes("старый формат")))
})

test("rejects malformed JSON and unsupported future schema versions", () => {
  assert.throws(() => parseNexoraBackup("{not-json"), /не удалось прочитать JSON/i)
  const future = createNexoraBackup(sampleData, sampleUI)
  future.schemaVersion = CURRENT_SCHEMA_VERSION + 1
  future.data.schemaVersion = CURRENT_SCHEMA_VERSION + 1
  assert.throws(() => parseNexoraBackup(JSON.stringify(future)), /более новую схему/i)
})

test("rejects duplicate entity ids and malformed task fields before restore", () => {
  const duplicate = createNexoraBackup({
    ...sampleData,
    tasks: [sampleData.tasks[0], { ...sampleData.tasks[0], title: "Дубликат" }],
  })
  assert.throws(() => parseNexoraBackup(JSON.stringify(duplicate)), /повторяется id/i)

  const malformed = createNexoraBackup({
    ...sampleData,
    tasks: [{ ...sampleData.tasks[0], dependsOn: "not-an-array" } as unknown as Persisted["tasks"][number]],
  })
  assert.throws(() => parseNexoraBackup(JSON.stringify(malformed)), /должно быть массивом строк/i)

  const malformedRule = createNexoraBackup({
    ...sampleData,
    tasks: [{
      ...sampleData.tasks[0],
      recurrenceRule: {
        ...sampleData.tasks[0].recurrenceRule!,
        byMonthDay: [0],
      },
    }],
  })
  assert.throws(() => parseNexoraBackup(JSON.stringify(malformedRule)), /BYMONTHDAY/i)
})

test("rejects a future backup envelope version", () => {
  const backup = createNexoraBackup(sampleData, sampleUI) as unknown as Record<string, unknown>
  backup.formatVersion = 2
  assert.throws(() => parseNexoraBackup(JSON.stringify(backup)), /более новой версией/i)
})
