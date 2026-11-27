import assert from "node:assert/strict"
import test from "node:test"
import { parseQuickTaskInput } from "./quick-task.ts"

test("parses a relative scheduled date", () => {
  const draft = parseQuickTaskInput("Подготовить отчёт через 3 дня", "2026-11-27")
  assert.equal(draft.title, "Подготовить отчёт")
  assert.equal(draft.scheduledDate, "2026-11-30")
})

test("parses a relative deadline without scheduling the task", () => {
  const draft = parseQuickTaskInput("Оплатить счёт до завтра", "2026-11-27")
  assert.equal(draft.title, "Оплатить счёт")
  assert.equal(draft.dueDate, "2026-11-28")
  assert.equal(draft.scheduledDate, undefined)
})

test("keeps unsupported relative phrases in the title", () => {
  const draft = parseQuickTaskInput("Обсудить через 500 дней", "2026-11-27")
  assert.equal(draft.title, "Обсудить через 500 дней")
})

test("parses a relative scheduled date in weeks", () => {
  const draft = parseQuickTaskInput("Подготовить релиз через 2 недели", "2026-11-27")
  assert.equal(draft.title, "Подготовить релиз")
  assert.equal(draft.scheduledDate, "2026-12-11")
})

test("keeps unsupported week offsets in the title", () => {
  const draft = parseQuickTaskInput("Обсудить через 53 недели", "2026-11-27")
  assert.equal(draft.title, "Обсудить через 53 недели")
})

test("parses a relative deadline in days", () => {
  const draft = parseQuickTaskInput("Сдать отчёт до через 5 дней", "2026-11-27")
  assert.equal(draft.title, "Сдать отчёт")
  assert.equal(draft.dueDate, "2026-12-02")
  assert.equal(draft.scheduledDate, undefined)
})

test("parses a relative deadline in weeks", () => {
  const draft = parseQuickTaskInput("Подготовить презентацию до через 2 недели", "2026-11-27")
  assert.equal(draft.title, "Подготовить презентацию")
  assert.equal(draft.dueDate, "2026-12-11")
})

test("keeps unsupported relative deadlines in the title", () => {
  const draft = parseQuickTaskInput("Обсудить до через 53 недели", "2026-11-27")
  assert.equal(draft.title, "Обсудить до через 53 недели")
  assert.equal(draft.dueDate, undefined)
})
