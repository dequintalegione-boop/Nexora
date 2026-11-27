import test from "node:test"
import assert from "node:assert/strict"
import { parseQuickTaskInput } from "../src/lib/nexora/quick-task.ts"

test("parses relative date, priority, tags and contexts", () => {
  assert.deepEqual(
    parseQuickTaskInput("Позвонить завтра !высокий #работа @офис", "2026-11-27"),
    {
      title: "Позвонить",
      priority: "high",
      scheduledDate: "2026-11-28",
      dueDate: undefined,
      tags: ["работа"],
      contexts: ["офис"],
    }
  )
})

test("parses a deadline separately from the planned date", () => {
  const result = parseQuickTaskInput("Оплатить счёт завтра до 2026-12-01", "2026-11-27")
  assert.equal(result.title, "Оплатить счёт")
  assert.equal(result.scheduledDate, "2026-11-28")
  assert.equal(result.dueDate, "2026-12-01")
})

test("keeps unknown syntax in the title and deduplicates metadata", () => {
  const result = parseQuickTaskInput("Проверить !срочно #дом #дом @ноутбук @ноутбук", "2026-11-27")
  assert.equal(result.title, "Проверить !срочно")
  assert.deepEqual(result.tags, ["дом"])
  assert.deepEqual(result.contexts, ["ноутбук"])
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
