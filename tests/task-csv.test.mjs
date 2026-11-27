import assert from "node:assert/strict"
import test from "node:test"
import { parseTasksCsv, serializeTasksCsv, TASK_CSV_FORMAT, TASK_CSV_VERSION } from "../src/lib/nexora/task-csv.ts"

const sampleTask = {
  id: "task-1",
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
  title: "Задача, с запятой и \"кавычками\"",
  description: "Первая строка\nВторая строка, с запятой",
  status: "in_progress",
  priority: "critical",
  dueDate: "2026-12-10",
  scheduledDate: "2026-12-09",
  startAt: "2026-12-09T14:30:00+01:00",
  endAt: "2026-12-09T15:15:00+01:00",
  allDay: false,
  timezone: "Europe/Amsterdam",
  projectId: "project-1",
  projectIds: ["project-1", "project-2"],
  directionId: "direction-1",
  parentId: "parent-1",
  dependsOn: ["dependency-1"],
  estimatedMinutes: 45,
  estimateMinutes: 50,
  actualMinutes: 18,
  notes: "Notes with comma, and quotes: \"ok\"",
  repeat: "weekly",
  recurrenceRule: {
    frequency: "monthly",
    interval: 2,
    byDay: [{ weekday: 1, ordinal: 1 }, { weekday: 5, ordinal: -1 }],
    byMonthDay: [1, -1],
    byMonth: [1, 6],
    weekStart: 1,
    excludeDates: ["2026-03-17"],
    count: 8,
    until: "2026-06-01",
  },
  recurrenceParentId: "series-1",
  occurrenceDate: "2026-12-09",
  occurrenceNumber: 12,
  recurrenceStartDate: "2025-01-01",
  recurrenceStartScheduledDate: "2025-01-01",
  recurrenceStartDueDate: "2025-01-02",
  recurrenceStartStartAt: "2025-01-01T14:30:00+01:00",
  recurrenceStartEndAt: "2025-01-01T15:15:00+01:00",
  skippedOccurrences: ["2026-02-01"],
  tags: ["работа", "важное"],
  contexts: ["компьютер"],
  reminders: [{ id: "reminder-1", minutesBefore: 30, enabled: true, anchor: "due" }],
  links: [{ id: "link-1", title: "Документ", url: "https://example.com/a?b=c,d" }],
  history: [{ at: "2026-01-02T10:00:00.000Z", change: "Обновлено" }],
  archived: false,
  completedAt: undefined,
}

test("exports and imports all task fields without losing dates, timezone, recurrence or relationships", () => {
  const csv = serializeTasksCsv([sampleTask])
  assert.ok(csv.startsWith("\uFEFF"))
  const parsed = parseTasksCsv(csv)
  assert.equal(parsed.formatVersion, TASK_CSV_VERSION)
  assert.equal(parsed.totalRows, 1)
  assert.equal(parsed.errors.length, 0)
  assert.deepEqual(
    JSON.parse(JSON.stringify(parsed.tasks[0])),
    JSON.parse(JSON.stringify(sampleTask)),
  )
})

test("exports a stable Nexora CSV schema even when there are no tasks", () => {
  const csv = serializeTasksCsv([])
  const parsed = parseTasksCsv(csv)
  assert.equal(parsed.formatVersion, TASK_CSV_VERSION)
  assert.equal(parsed.totalRows, 0)
  assert.deepEqual(parsed.tasks, [])
})

test("imports external CSV aliases and common delimited list fields", () => {
  const csv = [
    "text,due,timeEstimate,tags,contexts,projects",
    '"Позвонить, клиенту",2026-12-11,25,"работа;важное","телефон","project-1;project-2"',
  ].join("\n")
  const parsed = parseTasksCsv(csv, {
    now: () => "2026-11-27T10:00:00.000Z",
    createId: () => "generated-task",
  })
  assert.equal(parsed.tasks.length, 1)
  assert.equal(parsed.errors.length, 0)
  assert.equal(parsed.tasks[0].title, "Позвонить, клиенту")
  assert.equal(parsed.tasks[0].dueDate, "2026-12-11")
  assert.equal(parsed.tasks[0].estimatedMinutes, 25)
  assert.deepEqual(parsed.tasks[0].tags, ["работа", "важное"])
  assert.deepEqual(parsed.tasks[0].contexts, ["телефон"])
  assert.deepEqual(parsed.tasks[0].projectIds, ["project-1", "project-2"])
  assert.equal(parsed.tasks[0].id, "generated-task")
})

test("reports invalid rows and duplicate IDs without discarding valid rows", () => {
  const csv = [
    "id,title,status,priority,tags",
    "same,Первая,inbox,none,work",
    "same,Дубликат,inbox,none,home",
    "bad,,inbox,none,home",
    'broken,Некорректная,inbox,none,"[broken"',
    "valid,Последняя,planned,high,ok",
  ].join("\n")
  const parsed = parseTasksCsv(csv)
  assert.deepEqual(parsed.tasks.map((task) => task.id), ["same", "valid"])
  assert.deepEqual(parsed.errors.map((error) => error.row), [3, 4, 5])
  assert.equal(parsed.totalRows, 5)
  assert.ok(parsed.warnings.some((warning) => warning.includes("3")))
})

test("rejects unsupported future Nexora CSV versions", () => {
  const csv = [
    "_nexora_format,_nexora_version,title",
    `${TASK_CSV_FORMAT},${TASK_CSV_VERSION + 1},Задача`,
  ].join("\n")
  assert.throws(() => parseTasksCsv(csv), /более новой версией/)
})

test("rejects malformed CSV quoting and files larger than the configured limit", () => {
  assert.throws(() => parseTasksCsv('title,description\nЗадача,"не закрыто'), /незакрытую кавычку/)
  assert.throws(() => parseTasksCsv("title\n" + "x".repeat(26 * 1024 * 1024)), /слишком большой/)
})

test("supports blank optional cells for explicit clearing during an update", () => {
  const csv = [
    "id,title,status,priority,description,tags,dueDate",
    "task-1,Task,planned,none,,,",
  ].join("\n")
  const parsed = parseTasksCsv(csv)
  const task = parsed.tasks[0]
  assert.equal(task.description, undefined)
  assert.equal(task.tags, undefined)
  assert.equal(task.dueDate, undefined)
  assert.ok(Object.hasOwn(task, "description"))
  assert.ok(Object.hasOwn(task, "tags"))
  assert.ok(Object.hasOwn(task, "dueDate"))
})


test("escapes formula-like text for spreadsheets and restores it on Nexora re-import", () => {
  const task = { ...sampleTask, id: "formula-task", title: "=HYPERLINK(\"https://example.com\",\"open\")" }
  const csv = serializeTasksCsv([task])
  assert.ok(csv.includes("\"'=HYPERLINK"))
  const parsed = parseTasksCsv(csv)
  assert.equal(parsed.tasks[0].title, task.title)
})


test("detects semicolon-delimited CSV used by locale-specific spreadsheet exports", () => {
  const csv = [
    "text;due;timeEstimate;tags",
    '"Задача; с разделителем";2026-12-11;30;"работа;важное"',
  ].join("\n")
  const parsed = parseTasksCsv(csv, { createId: () => "semicolon-task" })
  assert.equal(parsed.tasks.length, 1)
  assert.equal(parsed.tasks[0].title, "Задача; с разделителем")
  assert.equal(parsed.tasks[0].estimatedMinutes, 30)
  assert.deepEqual(parsed.tasks[0].tags, ["работа", "важное"])
})


test("protects formula-like text even when it begins with whitespace", () => {
  const task = { ...sampleTask, id: "formula-whitespace", title: "   =1+1" }
  const csv = serializeTasksCsv([task])
  assert.ok(csv.includes("\"'   =1+1\""))
  assert.equal(parseTasksCsv(csv).tasks[0].title, task.title)
})
