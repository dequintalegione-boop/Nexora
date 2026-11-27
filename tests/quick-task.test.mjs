import test from "node:test"
import assert from "node:assert/strict"
import { parseQuickTaskInput } from "../src/lib/nexora/quick-task.ts"

test("parses relative date, priority, tags and contexts", () => {
  assert.deepEqual(
    parseQuickTaskInput("Позвонить завтра !высокий #работа @офис", "2026-11-27"),
    {
      title: "Позвонить", priority: "high", scheduledDate: "2026-11-28",
      dueDate: undefined, startAt: undefined, endAt: undefined,
      tags: ["работа"], contexts: ["офис"],
      status: undefined, projectTitle: undefined, estimatedMinutes: undefined,
    }
  )
})

test("parses a deadline separately from the planned date", () => {
  const result = parseQuickTaskInput("Оплатить счёт завтра до 2026-12-01", "2026-11-27")
  assert.equal(result.title, "Оплатить счёт")
  assert.equal(result.scheduledDate, "2026-11-28")
  assert.equal(result.dueDate, "2026-12-01")
})

test("parses priority syntax and deduplicates metadata", () => {
  const result = parseQuickTaskInput("Проверить !срочно #дом #дом @ноутбук @ноутбук", "2026-11-27")
  assert.equal(result.title, "Проверить")
  assert.equal(result.priority, "high")
  assert.deepEqual(result.tags, ["дом"])
  assert.deepEqual(result.contexts, ["ноутбук"])
})

test("keeps an unknown priority marker in the title", () => {
  const result = parseQuickTaskInput("Проверить !неизвестно", "2026-11-27")
  assert.equal(result.title, "Проверить !неизвестно")
})

test("supports critical priority and day after tomorrow", () => {
  const result = parseQuickTaskInput("Подготовить отчёт послезавтра !критический", "2026-11-27")
  assert.equal(result.priority, "critical")
  assert.equal(result.scheduledDate, "2026-11-29")
  assert.equal(result.title, "Подготовить отчёт")
})

test("returns an empty title for metadata-only input", () => {
  const result = parseQuickTaskInput("завтра #работа @офис", "2026-11-27")
  assert.equal(result.title, "")
  assert.equal(result.scheduledDate, "2026-11-28")
})

test("does not consume invalid calendar dates", () => {
  const result = parseQuickTaskInput("Перенести встречу до 2026-02-30", "2026-11-27")
  assert.equal(result.title, "Перенести встречу до 2026-02-30")
  assert.equal(result.dueDate, undefined)
})

test("parses a time on the current day when no date is provided", () => {
  const result = parseQuickTaskInput("Позвонить клиенту в 14:30", "2026-11-27")
  assert.equal(result.title, "Позвонить клиенту")
  assert.equal(result.scheduledDate, "2026-11-27")
  assert.equal(result.startAt, "2026-11-27T14:30")
  assert.equal(result.endAt, undefined)
})

test("combines a relative date with a time", () => {
  const result = parseQuickTaskInput("Встреча завтра в 09:05", "2026-11-27")
  assert.equal(result.title, "Встреча")
  assert.equal(result.scheduledDate, "2026-11-28")
  assert.equal(result.startAt, "2026-11-28T09:05")
})

test("parses a time range as a scheduled time block", () => {
  const result = parseQuickTaskInput("Подготовить отчёт сегодня с 09:00 до 10:45", "2026-11-27")
  assert.equal(result.title, "Подготовить отчёт")
  assert.equal(result.startAt, "2026-11-27T09:00")
  assert.equal(result.endAt, "2026-11-27T10:45")
})

test("supports a time block crossing midnight", () => {
  const result = parseQuickTaskInput("Дежурство с 22:00 до 06:00", "2026-11-27")
  assert.equal(result.startAt, "2026-11-27T22:00")
  assert.equal(result.endAt, "2026-11-28T06:00")
})

test("keeps invalid clock times in the title", () => {
  const result = parseQuickTaskInput("Созвон в 25:90", "2026-11-27")
  assert.equal(result.title, "Созвон в 25:90")
  assert.equal(result.startAt, undefined)
})

test("keeps an empty time range in the title", () => {
  const result = parseQuickTaskInput("Работа с 09:00 до 09:00", "2026-11-27")
  assert.equal(result.title, "Работа с 09:00 до 09:00")
  assert.equal(result.startAt, undefined)
})
