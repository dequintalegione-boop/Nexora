import test from "node:test"
import assert from "node:assert/strict"
import { getTaskStatusLabels, getTaskPriorityLabels } from "../src/lib/nexora/copy.ts"

test("custom task labels override defaults without changing internal status keys", () => {
  const labels = getTaskStatusLabels({ taskStatusLabels: { inbox: "На разбор", done: "Выполнено" } })
  assert.equal(labels.inbox, "На разбор")
  assert.equal(labels.done, "Выполнено")
  assert.equal(labels.in_progress, "В процессе")
})

test("blank custom labels fall back to defaults", () => {
  const labels = getTaskPriorityLabels({ taskPriorityLabels: { high: "   ", critical: "Срочно" } })
  assert.equal(labels.high, "Высокий")
  assert.equal(labels.critical, "Срочно")
  assert.equal(labels.none, "Без приоритета")
})
