import test from "node:test"
import assert from "node:assert/strict"
import { getDueTaskReminders, getTaskReminderTimestamp } from "../src/lib/nexora/reminders.ts"

const baseTask = {
  id: "task-1",
  createdAt: "2026-11-27T08:00:00.000Z",
  updatedAt: "2026-11-27T08:00:00.000Z",
  title: "Позвонить клиенту",
  status: "planned",
  priority: "medium",
}

test("calculates a relative reminder before the scheduled start", () => {
  const task = { ...baseTask, scheduledDate: "2026-11-27", startAt: "2026-11-27T14:30" }
  const reminder = { id: "r1", minutesBefore: 15, anchor: "start", enabled: true }
  assert.equal(getTaskReminderTimestamp(task, reminder), new Date(2026, 10, 27, 14, 15).getTime())
})

test("uses the due date as the reminder anchor when requested", () => {
  const task = { ...baseTask, dueDate: "2026-11-28" }
  const reminder = { id: "r1", minutesBefore: 30, anchor: "due", enabled: true }
  assert.equal(getTaskReminderTimestamp(task, reminder), new Date(2026, 10, 28, 8, 30).getTime())
})

test("supports an absolute reminder date and time", () => {
  const reminder = { id: "r1", at: "2026-11-27T14:30", enabled: true }
  const task = { ...baseTask }
  assert.equal(getTaskReminderTimestamp(task, reminder), new Date(2026, 10, 27, 14, 30).getTime())
})

test("does not deliver disabled, delivered, completed, archived or stale reminders", () => {
  const now = new Date(2026, 10, 27, 14, 30).getTime()
  const reminder = { id: "r1", at: "2026-11-27T14:20", enabled: true }
  const delivered = { ...reminder, lastTriggeredAt: "2026-11-27T14:20:00.000Z" }
  const disabled = { ...reminder, enabled: false }
  const tasks = [
    { ...baseTask, reminders: [reminder] },
    { ...baseTask, id: "done", status: "done", reminders: [reminder] },
    { ...baseTask, id: "archived", archived: true, reminders: [reminder] },
    { ...baseTask, id: "delivered", reminders: [delivered] },
    { ...baseTask, id: "disabled", reminders: [disabled] },
    { ...baseTask, id: "stale", reminders: [{ ...reminder, at: "2026-11-27T13:00" }] },
  ]
  assert.deepEqual(getDueTaskReminders(tasks, now).map((item) => item.task.id), ["task-1"])
})

test("ignores reminders without a valid anchor", () => {
  const task = { ...baseTask }
  assert.equal(getTaskReminderTimestamp(task, { id: "r1", minutesBefore: 10, enabled: true }), null)
})
