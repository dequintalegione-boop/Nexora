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

test("parses a relative scheduled date in months", () => {
  const draft = parseQuickTaskInput("Подготовить квартальный отчёт через 3 месяца", "2026-11-27")
  assert.equal(draft.title, "Подготовить квартальный отчёт")
  assert.equal(draft.scheduledDate, "2027-02-27")
})

test("clamps month offsets to the last day of shorter months", () => {
  const draft = parseQuickTaskInput("Проверить оплату через 1 месяц", "2026-01-31")
  assert.equal(draft.scheduledDate, "2026-02-28")
})

test("keeps unsupported month offsets in the title", () => {
  const draft = parseQuickTaskInput("Вернуться к вопросу через 25 месяцев", "2026-11-27")
  assert.equal(draft.title, "Вернуться к вопросу через 25 месяцев")
})

test("parses a relative deadline in months", () => {
  const draft = parseQuickTaskInput("Оплатить аренду до через 2 месяца", "2026-11-27")
  assert.equal(draft.title, "Оплатить аренду")
  assert.equal(draft.dueDate, "2027-01-27")
  assert.equal(draft.scheduledDate, undefined)
})

test("clamps relative month deadlines at the end of shorter months", () => {
  const draft = parseQuickTaskInput("Оплатить счёт до через 1 месяц", "2026-01-31")
  assert.equal(draft.dueDate, "2026-02-28")
})

test("keeps unsupported relative month deadlines in the title", () => {
  const draft = parseQuickTaskInput("Обсудить до через 25 месяцев", "2026-11-27")
  assert.equal(draft.title, "Обсудить до через 25 месяцев")
  assert.equal(draft.dueDate, undefined)
})

test("parses weekday as scheduled date", () => {
  // 2026-11-27 is Friday → next Monday is 2026-11-30
  const draft = parseQuickTaskInput("Созвон в понедельник", "2026-11-27")
  assert.equal(draft.title, "Созвон")
  assert.equal(draft.scheduledDate, "2026-11-30")
})

test("parses due weekday", () => {
  const draft = parseQuickTaskInput("Сдать отчёт до пятницы", "2026-11-27")
  assert.equal(draft.title, "Сдать отчёт")
  assert.equal(draft.dueDate, "2026-12-04")
})

test("parses named month date as scheduled", () => {
  const draft = parseQuickTaskInput("Встреча 15 декабря", "2026-11-27")
  assert.equal(draft.title, "Встреча")
  assert.equal(draft.scheduledDate, "2026-12-15")
})

test("parses named month date as due", () => {
  const draft = parseQuickTaskInput("Оплатить до 10 января", "2026-11-27")
  assert.equal(draft.title, "Оплатить")
  assert.equal(draft.dueDate, "2027-01-10")
})

test("parses duration estimate in minutes", () => {
  const draft = parseQuickTaskInput("Написать письмо 30 минут", "2026-11-27")
  assert.equal(draft.title, "Написать письмо")
  assert.equal(draft.estimatedMinutes, 30)
})

test("parses duration estimate in hours", () => {
  const draft = parseQuickTaskInput("Подготовить доклад 2ч !высокий", "2026-11-27")
  assert.equal(draft.title, "Подготовить доклад")
  assert.equal(draft.estimatedMinutes, 120)
  assert.equal(draft.priority, "high")
})

test("parses project marker", () => {
  const draft = parseQuickTaskInput("Черновик +Nexora #docs", "2026-11-27")
  assert.equal(draft.title, "Черновик")
  assert.equal(draft.projectTitle, "Nexora")
  assert.deepEqual(draft.tags, ["docs"])
})

test("parses status marker", () => {
  const draft = parseQuickTaskInput("Проверить *в_работе", "2026-11-27")
  assert.equal(draft.title, "Проверить")
  assert.equal(draft.status, "in_progress")
})

test("combined NLP tokens leave clean title", () => {
  const draft = parseQuickTaskInput(
    "Позвонить клиенту завтра в 14:30 45 минут !высокий #продажи @офис +CRM *planned",
    "2026-11-27",
  )
  assert.equal(draft.title, "Позвонить клиенту")
  assert.equal(draft.scheduledDate, "2026-11-28")
  assert.equal(draft.startAt, "2026-11-28T14:30")
  assert.equal(draft.estimatedMinutes, 45)
  assert.equal(draft.priority, "high")
  assert.deepEqual(draft.tags, ["продажи"])
  assert.deepEqual(draft.contexts, ["офис"])
  assert.equal(draft.projectTitle, "CRM")
  assert.equal(draft.status, "planned")
})
