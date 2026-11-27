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

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isValidDateTime(value: string): boolean {
  return Number.isFinite(new Date(value).getTime())
}

function validateImportedTask(task: Record<string, unknown>): void {
  for (const field of ["createdAt", "updatedAt", "startAt", "endAt", "recurrenceStartStartAt", "recurrenceStartEndAt", "archivedAt", "deletedAt", "completedAt"] as const) {
    const value = task[field]
    if (typeof value === "string" && value && !isValidDateTime(value)) {
      throw new Error(`Поле «${field}» содержит некорректную дату или время.`)
    }
  }

  for (const field of ["dueDate", "scheduledDate", "occurrenceDate", "recurrenceStartDate", "recurrenceStartScheduledDate", "recurrenceStartDueDate"] as const) {
    const value = task[field]
    if (typeof value === "string" && value && !isValidDateOnly(value)) {
      throw new Error(`Поле «${field}» должно иметь корректный формат YYYY-MM-DD.`)
    }
  }

  if (typeof task.timezone === "string" && task.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: task.timezone }).format(0)
    } catch {
      throw new Error("Поле «timezone» содержит неизвестный часовой пояс.")
    }
  }

  for (const field of ["estimatedMinutes", "estimateMinutes", "actualMinutes"] as const) {
    const value = task[field]
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error(`Поле «${field}» должно быть неотрицательным числом.`)
    }
  }
  if (task.occurrenceNumber !== undefined &&
      (typeof task.occurrenceNumber !== "number" || !Number.isInteger(task.occurrenceNumber) || task.occurrenceNumber < 1)) {
    throw new Error("Поле «occurrenceNumber» должно быть положительным целым числом.")
  }

  if (task.repeat !== undefined && task.repeat !== "daily" && task.repeat !== "weekly") {
    throw new Error("Поле «repeat» содержит неподдерживаемый тип повторения.")
  }

  const rule = task.recurrenceRule
  if (rule !== undefined) {
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
      throw new Error("Поле «recurrenceRule» должно быть JSON-объектом.")
    }
    const value = rule as Record<string, unknown>
    if (!["daily", "weekly", "monthly", "yearly"].includes(String(value.frequency))) {
      throw new Error("Правило повторения содержит неизвестную частоту.")
    }
    if (!Number.isInteger(value.interval) || (value.interval as number) < 1) {
      throw new Error("Интервал повторения должен быть положительным целым числом.")
    }
    if (value.count !== undefined && (!Number.isInteger(value.count) || (value.count as number) < 1)) {
      throw new Error("COUNT в правиле повторения должен быть положительным целым числом.")
    }
    if (value.until !== undefined && (typeof value.until !== "string" || !isValidDateOnly(value.until))) {
      throw new Error("UNTIL в правиле повторения должен быть корректной датой YYYY-MM-DD.")
    }
    if (value.weekStart !== undefined && (!Number.isInteger(value.weekStart) || (value.weekStart as number) < 0 || (value.weekStart as number) > 6)) {
      throw new Error("WKST в правиле повторения должен быть числом от 0 до 6.")
    }
    for (const field of ["weekdays", "byMonthDay", "byMonth"] as const) {
      const items = value[field]
      if (items !== undefined && (!Array.isArray(items) || !items.every(Number.isInteger))) {
        throw new Error(`Поле «${field}» правила повторения должно быть массивом целых чисел.`)
      }
    }
    if (value.weekdays !== undefined && !(value.weekdays as number[]).every((day) => day >= 0 && day <= 6)) {
      throw new Error("Дни недели в правиле повторения должны быть от 0 до 6.")
    }
    if (value.byMonth !== undefined && !(value.byMonth as number[]).every((month) => month >= 1 && month <= 12)) {
      throw new Error("BYMONTH должен содержать месяцы от 1 до 12.")
    }
    if (value.byMonthDay !== undefined && !(value.byMonthDay as number[]).every((day) => day !== 0 && Math.abs(day) <= 31)) {
      throw new Error("BYMONTHDAY должен содержать значения от -31 до -1 или от 1 до 31.")
    }
    if (value.byDay !== undefined) {
      if (!Array.isArray(value.byDay) || !value.byDay.every((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item) &&
        Number.isInteger((item as Record<string, unknown>).weekday) &&
        ((item as Record<string, unknown>).weekday as number) >= 0 &&
        ((item as Record<string, unknown>).weekday as number) <= 6 &&
        ((item as Record<string, unknown>).ordinal === undefined ||
          (Number.isInteger((item as Record<string, unknown>).ordinal) &&
            (item as Record<string, unknown>).ordinal !== 0 &&
            Math.abs((item as Record<string, unknown>).ordinal as number) <= 5))
      )) {
        throw new Error("BYDAY содержит некорректный день недели или порядковый номер.")
      }
    }
    if (value.excludeDates !== undefined &&
        (!Array.isArray(value.excludeDates) || !value.excludeDates.every((item) => typeof item === "string" && isValidDateOnly(item)))) {
      throw new Error("EXDATE должен содержать корректные даты YYYY-MM-DD.")
    }
  }

  const reminders = task.reminders
  if (reminders !== undefined) {
    if (!Array.isArray(reminders) || !reminders.every((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return false
      const reminder = item as Record<string, unknown>
      return typeof reminder.id === "string" && reminder.id.trim().length > 0 &&
        typeof reminder.enabled === "boolean" &&
        (reminder.minutesBefore === undefined ||
          (typeof reminder.minutesBefore === "number" && Number.isFinite(reminder.minutesBefore) && reminder.minutesBefore >= 0)) &&
        (reminder.at === undefined || (typeof reminder.at === "string" && isValidDateTime(reminder.at))) &&
        (reminder.anchor === undefined || reminder.anchor === "start" || reminder.anchor === "due") &&
        (reminder.lastTriggeredAt === undefined ||
          (typeof reminder.lastTriggeredAt === "string" && isValidDateTime(reminder.lastTriggeredAt)))
    })) {
      throw new Error("Массив reminders содержит некорректное напоминание.")
    }
  }

  const links = task.links
  if (links !== undefined && (!Array.isArray(links) || !links.every((item) =>
    typeof item === "object" && item !== null && !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).id === "string" &&
    Boolean(((item as Record<string, unknown>).id as string).trim()) &&
    typeof (item as Record<string, unknown>).title === "string" &&
    typeof (item as Record<string, unknown>).url === "string"
  ))) {
    throw new Error("Массив links содержит некорректную ссылку.")
  }

  const history = task.history
  if (history !== undefined && (!Array.isArray(history) || !history.every((item) =>
    typeof item === "object" && item !== null && !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).at === "string" &&
    isValidDateTime((item as Record<string, unknown>).at as string) &&
    typeof (item as Record<string, unknown>).change === "string"
  ))) {
    throw new Error("Массив history содержит некорректную запись.")
  }
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

  validateImportedTask(task)
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
