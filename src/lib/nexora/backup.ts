import { CURRENT_SCHEMA_VERSION, migratePersistedData } from "./migrate.ts"
import type { Persisted, Settings, Task } from "./types"
import type { SavedTaskView, TaskTableColumn } from "./ui-store"
import type { TaskTemplate } from "./task-templates"
import type { KanbanGroupBy } from "./kanban"

export const NEXORA_BACKUP_FORMAT = "nexora-backup"
export const NEXORA_BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024

export type BackupUIState = {
  savedTaskViews?: SavedTaskView[]
  taskTableColumns?: TaskTableColumn[]
  kanbanGroupBy?: KanbanGroupBy
  taskTemplates?: TaskTemplate[]
}

export type NexoraBackup = {
  format: typeof NEXORA_BACKUP_FORMAT
  formatVersion: number
  schemaVersion: number
  exportedAt: string
  data: Persisted
  ui: BackupUIState
}

export type ParsedNexoraBackup = {
  data: Persisted
  ui?: BackupUIState
  exportedAt?: string
  isLegacy: boolean
  warnings: string[]
}

const COLLECTION_KEYS = [
  "directions",
  "projects",
  "tasks",
  "habits",
  "habitLogs",
  "entries",
  "goals",
  "sessions",
] as const

const TABLE_COLUMNS: TaskTableColumn[] = [
  "title",
  "status",
  "priority",
  "dueDate",
  "scheduledDate",
  "projects",
  "tags",
  "estimate",
  "actual",
  "updatedAt",
]

const GROUP_BY_VALUES: KanbanGroupBy[] = ["status", "priority", "project"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw new Error(message)
}

function readCollection(
  data: Record<string, unknown>,
  key: (typeof COLLECTION_KEYS)[number],
  warnings: string[],
): Record<string, unknown>[] {
  const value = data[key]
  if (value === undefined) {
    warnings.push("В файле отсутствует коллекция «" + key + "»; при восстановлении она будет пустой.")
    return []
  }
  if (!Array.isArray(value)) fail("Поле «" + key + "» должно быть массивом.")
  if (!value.every(isRecord)) fail("Коллекция «" + key + "» содержит некорректную запись.")
  return value
}

function assertUniqueIds(
  records: Record<string, unknown>[],
  collectionName: string,
): void {
  const ids = new Set<string>()
  for (const record of records) {
    if (typeof record.id !== "string" || !record.id.trim()) {
      fail("В коллекции «" + collectionName + "» найдена запись без корректного id.")
    }
    if (ids.has(record.id)) {
      fail("В коллекции «" + collectionName + "» повторяется id «" + record.id + "». Импорт отменён.")
    }
    ids.add(record.id)
  }
}

function validateTaskRecords(records: Record<string, unknown>[]): void {
  for (const task of records) {
    if (typeof task.title !== "string" || !task.title.trim()) {
      fail("У одной из задач отсутствует название.")
    }
    if (typeof task.status !== "string" || typeof task.priority !== "string") {
      fail("У задачи «" + task.title + "» некорректные статус или приоритет.")
    }
    for (const field of ["dependsOn", "projectIds", "tags", "contexts", "skippedOccurrences"]) {
      const value = task[field]
      if (value !== undefined && (!Array.isArray(value) || !value.every((item) => typeof item === "string"))) {
        fail("Поле «" + field + "» задачи «" + task.title + "» должно быть массивом строк.")
      }
    }
    for (const field of ["reminders", "links", "history"]) {
      const value = task[field]
      if (value !== undefined && !Array.isArray(value)) {
        fail("Поле «" + field + "» задачи «" + task.title + "» должно быть массивом.")
      }
    }
  }
}

function validateSettings(value: unknown): Settings {
  if (!isRecord(value)) fail("В резервной копии отсутствуют настройки Nexora.")
  if (value.theme !== "light" && value.theme !== "dark" && value.theme !== "system") {
    fail("В резервной копии указана неизвестная тема оформления.")
  }
  if (typeof value.accent !== "string" || typeof value.displayName !== "string") {
    fail("Настройки содержат некорректное имя пользователя или акцентный цвет.")
  }
  if (value.weekStartsOn !== 0 && value.weekStartsOn !== 1) {
    fail("Настройка первого дня недели должна быть 0 или 1.")
  }
  if (!Array.isArray(value.widgetOrder) || !value.widgetOrder.every((item) => typeof item === "string")) {
    fail("Порядок виджетов в настройках имеет неверный формат.")
  }
  if (!Array.isArray(value.hiddenWidgets) || !value.hiddenWidgets.every((item) => typeof item === "string")) {
    fail("Список скрытых виджетов в настройках имеет неверный формат.")
  }
  if (value.taskStatuses !== undefined && !Array.isArray(value.taskStatuses)) {
    fail("Каталог статусов задач имеет неверный формат.")
  }
  if (value.taskPriorities !== undefined && !Array.isArray(value.taskPriorities)) {
    fail("Каталог приоритетов задач имеет неверный формат.")
  }
  return value as unknown as Settings
}

function parseUIState(value: unknown): BackupUIState | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) fail("Настройки представлений в резервной копии имеют неверный формат.")

  const result: BackupUIState = {}

  if (value.savedTaskViews !== undefined) {
    if (!Array.isArray(value.savedTaskViews) || !value.savedTaskViews.every(isRecord)) {
      fail("Сохранённые представления задач имеют неверный формат.")
    }
    const views = value.savedTaskViews as Record<string, unknown>[]
    assertUniqueIds(views, "savedTaskViews")
    for (const view of views) {
      if (
        typeof view.name !== "string" ||
        (view.layout !== "list" && view.layout !== "table" && view.layout !== "kanban")
      ) {
        fail("Одно из сохранённых представлений задач заполнено некорректно.")
      }
    }
    result.savedTaskViews = views as unknown as SavedTaskView[]
  }

  if (value.taskTableColumns !== undefined) {
    if (
      !Array.isArray(value.taskTableColumns) ||
      !value.taskTableColumns.every((column) => typeof column === "string" && TABLE_COLUMNS.includes(column as TaskTableColumn)) ||
      !value.taskTableColumns.includes("title")
    ) {
      fail("Настройка колонок таблицы должна содержать обязательную колонку «Задача».")
    }
    result.taskTableColumns = value.taskTableColumns as TaskTableColumn[]
  }

  if (value.kanbanGroupBy !== undefined) {
    if (typeof value.kanbanGroupBy !== "string" || !GROUP_BY_VALUES.includes(value.kanbanGroupBy as KanbanGroupBy)) {
      fail("Неизвестный способ группировки Kanban.")
    }
    result.kanbanGroupBy = value.kanbanGroupBy as KanbanGroupBy
  }

  if (value.taskTemplates !== undefined) {
    if (!Array.isArray(value.taskTemplates) || !value.taskTemplates.every(isRecord)) {
      fail("Шаблоны задач имеют неверный формат.")
    }
    const templates = value.taskTemplates as Record<string, unknown>[]
    assertUniqueIds(templates, "taskTemplates")
    for (const template of templates) {
      if (
        typeof template.name !== "string" ||
        !template.name.trim() ||
        typeof template.title !== "string" ||
        !template.title.trim() ||
        typeof template.priority !== "string"
      ) {
        fail("Один из шаблонов задач заполнен некорректно.")
      }
    }
    result.taskTemplates = templates as unknown as TaskTemplate[]
  }

  return result
}

export function createNexoraBackup(
  data: Persisted,
  ui: BackupUIState = {},
  exportedAt = new Date().toISOString(),
): NexoraBackup {
  const persistedData: Persisted = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    directions: data.directions,
    projects: data.projects,
    tasks: data.tasks,
    habits: data.habits,
    habitLogs: data.habitLogs,
    entries: data.entries,
    goals: data.goals,
    sessions: data.sessions,
    activeTimer: data.activeTimer ?? null,
    settings: data.settings,
    automationRules: data.automationRules ?? [],
    automationRuns: data.automationRuns ?? [],
  }

  return {
    format: NEXORA_BACKUP_FORMAT,
    formatVersion: NEXORA_BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    data: persistedData,
    ui: {
      savedTaskViews: ui.savedTaskViews ?? [],
      taskTableColumns: ui.taskTableColumns ?? ["title", "status", "priority", "dueDate", "projects"],
      kanbanGroupBy: ui.kanbanGroupBy ?? "status",
      taskTemplates: ui.taskTemplates ?? [],
    },
  }
}

export function serializeNexoraBackup(backup: NexoraBackup): string {
  return JSON.stringify(backup, null, 2)
}

export function parseNexoraBackup(text: string): ParsedNexoraBackup {
  if (!text.trim()) fail("Файл резервной копии пуст.")
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_FILE_BYTES) {
    fail("Файл резервной копии слишком большой (максимум 25 МБ).")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail("Не удалось прочитать JSON. Проверьте, что выбран файл резервной копии Nexora.")
  }
  if (!isRecord(parsed)) fail("Корень резервной копии должен быть JSON-объектом.")

  const isEnvelope = parsed.format === NEXORA_BACKUP_FORMAT
  if (parsed.format !== undefined && !isEnvelope) {
    fail("Формат файла не распознан как резервная копия Nexora.")
  }

  let rawData: unknown = isEnvelope ? parsed.data : parsed
  if (!isRecord(rawData)) fail("В резервной копии отсутствует блок данных.")

  if (isEnvelope) {
    if (!Number.isInteger(parsed.formatVersion) || (parsed.formatVersion as number) < 1) {
      fail("Версия формата резервной копии не распознана.")
    }
    if ((parsed.formatVersion as number) > NEXORA_BACKUP_FORMAT_VERSION) {
      fail("Резервная копия создана более новой версией Nexora. Обновите приложение перед восстановлением.")
    }
  }

  const rawSchemaVersion =
    rawData.schemaVersion ??
    parsed.schemaVersion ??
    (!isEnvelope ? parsed.schema : undefined) ??
    0

  if (typeof rawSchemaVersion !== "number" || !Number.isInteger(rawSchemaVersion) || rawSchemaVersion < 0) {
    fail("Версия схемы данных в резервной копии некорректна.")
  }
  if (rawSchemaVersion > CURRENT_SCHEMA_VERSION) {
    fail("Резервная копия использует более новую схему данных. Обновите Nexora перед восстановлением.")
  }

  const warnings: string[] = []
  const collections = Object.fromEntries(
    COLLECTION_KEYS.map((key) => [key, readCollection(rawData, key, warnings)]),
  ) as Record<(typeof COLLECTION_KEYS)[number], Record<string, unknown>[]>

  for (const key of COLLECTION_KEYS) {
    assertUniqueIds(collections[key], key)
  }
  validateTaskRecords(collections.tasks)

  const settings = validateSettings(rawData.settings)
  if (rawData.activeTimer !== undefined && rawData.activeTimer !== null && !isRecord(rawData.activeTimer)) {
    fail("Активный таймер в резервной копии имеет неверный формат.")
  }

  const cleanData = { ...rawData }
  delete cleanData.schema
  delete cleanData.exportedAt
  delete cleanData.format
  delete cleanData.formatVersion
  delete cleanData.ui

  const dataToMigrate: Partial<Persisted> = {
    ...cleanData,
    schemaVersion: rawSchemaVersion,
    directions: collections.directions as unknown as Persisted["directions"],
    projects: collections.projects as unknown as Persisted["projects"],
    tasks: collections.tasks as unknown as Task[],
    habits: collections.habits as unknown as Persisted["habits"],
    habitLogs: collections.habitLogs as unknown as Persisted["habitLogs"],
    entries: collections.entries as unknown as Persisted["entries"],
    goals: collections.goals as unknown as Persisted["goals"],
    sessions: collections.sessions as unknown as Persisted["sessions"],
    activeTimer: (rawData.activeTimer ?? null) as Persisted["activeTimer"],
    settings,
    automationRules: Array.isArray(rawData.automationRules) ? rawData.automationRules as Persisted["automationRules"] : [],
    automationRuns: Array.isArray(rawData.automationRuns) ? rawData.automationRuns as Persisted["automationRuns"] : [],
  }

  if (rawData.automationRules !== undefined && !Array.isArray(rawData.automationRules)) {
    fail("Правила автоматизации в резервной копии имеют неверный формат.")
  }
  if (rawData.automationRuns !== undefined && !Array.isArray(rawData.automationRuns)) {
    fail("Журнал автоматизаций в резервной копии имеет неверный формат.")
  }

  const migrated = migratePersistedData(dataToMigrate)
  if (migrated.migrated) {
    warnings.push("Данные обновлены до текущей версии схемы Nexora (" + CURRENT_SCHEMA_VERSION + ").")
  }

  const ui = isEnvelope ? parseUIState(parsed.ui) : undefined
  if (!isEnvelope) {
    warnings.push("Обнаружен старый формат JSON-бэкапа. Сохранены данные и настройки приложения; локальные представления и шаблоны, которых нет в старом файле, останутся текущими.")
  }

  return {
    data: migrated.data,
    ui,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
    isLegacy: !isEnvelope,
    warnings,
  }
}
