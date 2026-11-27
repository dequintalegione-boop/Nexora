import type { Task } from "./types.ts"

export const TASK_CSV_FORMAT = "nexora-tasks"
export const TASK_CSV_VERSION = 1
export const MAX_TASK_CSV_FILE_BYTES = 25 * 1024 * 1024

export type TaskCsvConflictMode = "skip" | "update"

export interface TaskCsvApplyResult {
  created: number
  updated: number
  skipped: number
}

export interface TaskCsvImportError {
  row: number
  message: string
}

export interface TaskCsvImportResult {
  tasks: Task[]
  errors: TaskCsvImportError[]
  warnings: string[]
  totalRows: number
  formatVersion: number | null
}

export interface TaskCsvParseOptions {
  now?: () => string
  createId?: () => string
}

const TASK_FIELDS = [
  "id",
  "title",
  "description",
  "status",
  "priority",
  "createdAt",
  "updatedAt",
  "dueDate",
  "scheduledDate",
  "startAt",
  "endAt",
  "allDay",
  "timezone",
  "projectId",
  "projectIds",
  "directionId",
  "parentId",
  "dependsOn",
  "estimatedMinutes",
  "estimateMinutes",
  "actualMinutes",
  "notes",
  "repeat",
  "recurrenceRule",
  "recurrenceParentId",
  "occurrenceDate",
  "occurrenceNumber",
  "recurrenceStartDate",
  "recurrenceStartScheduledDate",
  "recurrenceStartDueDate",
  "recurrenceStartStartAt",
  "recurrenceStartEndAt",
  "skippedOccurrences",
  "tags",
  "contexts",
  "reminders",
  "links",
  "history",
  "archived",
  "archivedAt",
  "deletedAt",
  "completedAt",
] as const satisfies readonly (keyof Task)[]

const OPTIONAL_STRING_FIELDS = [
  "description",
  "dueDate",
  "scheduledDate",
  "startAt",
  "endAt",
  "timezone",
  "projectId",
  "directionId",
  "parentId",
  "notes",
  "repeat",
  "recurrenceParentId",
  "occurrenceDate",
  "recurrenceStartDate",
  "recurrenceStartScheduledDate",
  "recurrenceStartDueDate",
  "recurrenceStartStartAt",
  "recurrenceStartEndAt",
  "archivedAt",
  "deletedAt",
  "completedAt",
] as const satisfies readonly (keyof Task)[]

const NUMBER_FIELDS = ["estimatedMinutes", "estimateMinutes", "actualMinutes", "occurrenceNumber"] as const
const BOOLEAN_FIELDS = ["allDay", "archived"] as const
const STRING_ARRAY_FIELDS = ["projectIds", "dependsOn", "skippedOccurrences", "tags", "contexts"] as const
const JSON_FIELDS = ["recurrenceRule", "reminders", "links", "history"] as const

const EXPORTED_HEADERS = ["_nexora_format", "_nexora_version", ...TASK_FIELDS] as const
const HEADER_ALIASES: Record<string, keyof Task> = {
  name: "title",
  text: "title",
  due: "dueDate",
  scheduled: "scheduledDate",
  timeestimate: "estimatedMinutes",
  timespent: "actualMinutes",
  projects: "projectIds",
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
}

function escapeCsvCell(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"'
}

function encodeTaskValue(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  const text = String(value)
  // Prefix formula-like text so opening CSV in spreadsheet software cannot execute it.
  return /^[\\s\\u0000]*[=+@-]/.test(text) ? "'" + text : text
}

/** Export all task fields in a UTF-8 CSV that can be round-tripped by Nexora. */
export function serializeTasksCsv(tasks: Task[]): string {
  const header = EXPORTED_HEADERS.map(escapeCsvCell).join(",")
  const rows = tasks.map((task) => {
    const values = [
      TASK_CSV_FORMAT,
      String(TASK_CSV_VERSION),
      ...TASK_FIELDS.map((field) => encodeTaskValue(task[field])),
    ]
    return values.map(escapeCsvCell).join(",")
  })
  return "\uFEFF" + [header, ...rows].join("\r\n") + "\r\n"
}

function detectCsvDelimiter(source: string): string {
  const text = source.replace(/^\uFEFF/, "")
  let commas = 0
  let semicolons = 0
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && (character === "\n" || character === "\r")) break
    if (!inQuotes && character === ",") commas += 1
    if (!inQuotes && character === ";") semicolons += 1
  }
  return semicolons > commas ? ";" : ","
}

function parseCsvRecords(source: string, delimiter: string): string[][] {
  const text = source.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let afterQuote = false

  const pushField = () => {
    row.push(field)
    field = ""
    afterQuote = false
  }
  const pushRow = () => {
    pushField()
    if (row.some((cell) => cell.trim() !== "")) rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          afterQuote = true
        }
      } else {
        field += character
      }
      continue
    }

    if (afterQuote) {
      if (character === delimiter) {
        pushField()
      } else if (character === "\n") {
        pushRow()
      } else if (character === "\r") {
        if (text[index + 1] === "\n") index += 1
        pushRow()
      } else if (character.trim() !== "") {
        throw new Error("CSV содержит символы после закрывающей кавычки.")
      }
      continue
    }

    if (character === '"') {
      if (field.trim() !== "") throw new Error("CSV содержит кавычку внутри незаключённого в кавычки поля.")
      field = ""
      inQuotes = true
    } else if (character === delimiter) {
      pushField()
    } else if (character === "\n") {
      pushRow()
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1
      pushRow()
    } else {
      field += character
    }
  }

  if (inQuotes) throw new Error("CSV содержит незакрытую кавычку.")
  if (field.length > 0 || row.length > 0 || afterQuote) pushRow()
  return rows
}

function parseStringArray(value: string, field: string): string[] | undefined {
  if (!value.trim()) return undefined
  if (value.trim().startsWith("[")) {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error(`Поле «${field}» содержит некорректный JSON.`)
    }
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error(`Поле «${field}» должно быть массивом строк.`)
    }
    return parsed
  }
  return value.split(/[;|]/).map((item) => item.trim()).filter(Boolean)
}

function parseJsonField(value: string, field: string, expected: "object" | "array"): unknown {
  if (!value.trim()) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`Поле «${field}» содержит некорректный JSON.`)
  }
  if (expected === "object" && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
    throw new Error(`Поле «${field}» должно быть JSON-объектом.`)
  }
  if (expected === "array" && !Array.isArray(parsed)) {
    throw new Error(`Поле «${field}» должно быть JSON-массивом.`)
  }
  return parsed
}

function parseNumberField(value: string, field: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Поле «${field}» должно быть числом.`)
  return parsed
}

function parseBooleanField(value: string, field: string): boolean | undefined {
  if (!value.trim()) return undefined
  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "да"].includes(normalized)) return true
  if (["false", "0", "no", "нет"].includes(normalized)) return false
  throw new Error(`Поле «${field}» должно быть true или false.`)
}

function cellFor(row: string[], fieldIndexes: Map<keyof Task, number>, field: keyof Task, safeCsv = false): string {
  const index = fieldIndexes.get(field)
  if (index === undefined) return ""
  const value = (row[index] ?? "").trim()
  return safeCsv && value.startsWith("'") && /^[\\s\\u0000]*[=+@-]/.test(value.slice(1))
    ? value.slice(1)
    : value
}

function buildTask(
  row: string[],
  fieldIndexes: Map<keyof Task, number>,
  rowNumber: number,
  options: Required<Pick<TaskCsvParseOptions, "now">> & TaskCsvParseOptions,
  safeCsv: boolean,
): Task {
  const get = (field: keyof Task) => cellFor(row, fieldIndexes, field, safeCsv)
  const title = get("title")
  if (!title) throw new Error("Не заполнено обязательное название задачи.")

  const now = options.now()
  const id = get("id") || options.createId?.() || `csv_import_${Date.now().toString(36)}_${rowNumber}`
  const status = (get("status") || "inbox") as Task["status"]
  const priority = (get("priority") || "none") as Task["priority"]

  const task: Record<string, unknown> = {
    id,
    title,
    status,
    priority,
    createdAt: get("createdAt") || now,
    updatedAt: get("updatedAt") || now,
  }

  // Include all optional string keys when the corresponding CSV column exists.
  // This lets the explicit "update existing" action clear a field intentionally left blank.
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (fieldIndexes.has(field)) task[field] = get(field) || undefined
  }

  for (const field of NUMBER_FIELDS) {
    if (fieldIndexes.has(field)) task[field] = parseNumberField(get(field), field)
  }
  for (const field of BOOLEAN_FIELDS) {
    if (fieldIndexes.has(field)) task[field] = parseBooleanField(get(field), field)
  }
  for (const field of STRING_ARRAY_FIELDS) {
    if (fieldIndexes.has(field)) task[field] = parseStringArray(get(field), field)
  }
  for (const field of JSON_FIELDS) {
    if (fieldIndexes.has(field)) {
      const expected = field === "recurrenceRule" ? "object" : "array"
      task[field] = parseJsonField(get(field), field, expected)
    }
  }

  return task as Task
}

/**
 * Parse a CSV export from Nexora or a simple external task CSV.
 * External columns accept aliases such as name/text, due, scheduled and timeEstimate.
 * Invalid rows are reported without blocking valid rows from preview.
 */
export function parseTasksCsv(source: string, options: TaskCsvParseOptions = {}): TaskCsvImportResult {
  if (!source.trim()) throw new Error("CSV-файл пуст.")
  if (new TextEncoder().encode(source).byteLength > MAX_TASK_CSV_FILE_BYTES) {
    throw new Error("CSV-файл слишком большой (максимум 25 МБ).")
  }

  const records = parseCsvRecords(source, detectCsvDelimiter(source))
  if (records.length < 1) throw new Error("CSV не содержит заголовка.")
  const headers = records[0].map(normalizeHeader)
  const fieldIndexes = new Map<keyof Task, number>()
  let formatIndex = -1
  let versionIndex = -1

  headers.forEach((header, index) => {
    if (header === "nexoraformat") {
      formatIndex = index
      return
    }
    if (header === "nexoraversion") {
      versionIndex = index
      return
    }

    const candidate = (TASK_FIELDS as readonly string[]).find((field) => normalizeHeader(field) === header)
    const field = (candidate as keyof Task | undefined) ?? HEADER_ALIASES[header]
    if (!field) return
    if (fieldIndexes.has(field)) {
      throw new Error(`CSV содержит повторяющуюся колонку для поля «${field}».`)
    }
    fieldIndexes.set(field, index)
  })

  if (!fieldIndexes.has("title")) {
    throw new Error("CSV должен содержать колонку title, name или text.")
  }

  let formatVersion: number | null = null
  if (versionIndex >= 0) {
    const versionText = records.slice(1).map((row) => row[versionIndex] ?? "").find(Boolean)
    if (versionText) {
      const version = Number(versionText)
      if (!Number.isInteger(version) || version < 1) throw new Error("Версия Nexora CSV указана некорректно.")
      if (version > TASK_CSV_VERSION) throw new Error("CSV создан более новой версией Nexora. Обновите приложение перед импортом.")
      formatVersion = version
    } else if (formatIndex >= 0) {
      // The versioned header is sufficient for an empty export (there are no rows to inspect).
      formatVersion = TASK_CSV_VERSION
    }
  }

  const now = options.now ?? (() => new Date().toISOString())
  const errors: TaskCsvImportError[] = []
  const warnings: string[] = []
  const tasks: Task[] = []
  const seenIds = new Set<string>()
  let totalRows = 0
  let generatedIds = 0

  for (let index = 1; index < records.length; index += 1) {
    const row = records[index]
    totalRows += 1
    const rowNumber = index + 1
    if (row.length > headers.length) {
      errors.push({ row: rowNumber, message: "Количество ячеек превышает количество колонок." })
      continue
    }
    if (formatIndex >= 0) {
      const marker = (row[formatIndex] ?? "").trim()
      if (marker && marker !== TASK_CSV_FORMAT) {
        errors.push({ row: rowNumber, message: "Неизвестный формат файла Nexora." })
        continue
      }
    }

    try {
      const task = buildTask(row, fieldIndexes, rowNumber, {
        now,
        createId: options.createId
          ? options.createId
          : () => `csv_import_${Date.now().toString(36)}_${++generatedIds}`,
      }, formatIndex >= 0 && (row[formatIndex] ?? "").trim() === TASK_CSV_FORMAT)
      if (seenIds.has(task.id)) {
        throw new Error(`В файле повторяется ID «${task.id}».`)
      }
      seenIds.add(task.id)
      tasks.push(task)
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : "Не удалось прочитать строку CSV.",
      })
    }
  }

  const knownHeaders = new Set([
    ...TASK_FIELDS.map(normalizeHeader),
    ...Object.keys(HEADER_ALIASES).map(normalizeHeader),
    "nexoraformat",
    "nexoraversion",
  ])
  const unknownHeaders = headers.filter((header) => header && !knownHeaders.has(header))
  if (unknownHeaders.length > 0) {
    warnings.push("Неизвестные колонки пропущены: " + unknownHeaders.join(", "))
  }
  if (errors.length > 0) {
    warnings.push(`Не импортированы строки с ошибками: ${errors.length}.`)
  }

  return { tasks, errors, warnings, totalRows, formatVersion }
}
