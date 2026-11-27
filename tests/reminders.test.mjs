import test from "node:test"
import assert from "node:assert/strict"
import { getDueTaskReminders, getTaskReminderTimestamp } from "../src/lib/nexora/reminders.ts"
import { createReminderTriggeredEventInput } from "../src/lib/nexora/reminder-events.ts"
import { createTaskDomainEvent, TaskEventBus } from "../src/lib/nexora/task-events.ts"

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


test("creates a metadata-only reminder.triggered domain event", () => {
  const input = {
    taskId: "task-1",
    reminderId: "reminder-1",
    scheduledAt: new Date(2026, 10, 27, 14, 15).getTime(),
    triggeredAt: "2026-11-27T14:15:03.000Z",
  }
  const eventInput = createReminderTriggeredEventInput(input)
  const event = createTaskDomainEvent(eventInput)

  assert.equal(event.type, "reminder.triggered")
  assert.equal(event.entityType, "reminder")
  assert.equal(event.entityId, "task-1:reminder-1")
  assert.equal(event.source, "system")
  assert.equal(event.occurredAt, input.triggeredAt)
  assert.equal(event.metadata.taskId, input.taskId)
  assert.equal(event.metadata.reminderId, input.reminderId)
  assert.equal(typeof event.metadata.scheduledAt, "string")
  assert.equal("title" in event, false)
  assert.equal("description" in event, false)
  assert.equal(event.before, undefined)
  assert.equal(event.after, undefined)
  assert.deepEqual(Object.keys(event.metadata).sort(), ["reminderId", "scheduledAt", "taskId"])
})

test("reminder delivery event IDs are deterministic and deduplicate delivery", () => {
  const input = {
    taskId: "task-1",
    reminderId: "reminder-1",
    scheduledAt: Date.parse("2026-11-27T14:15:00.000Z"),
    triggeredAt: "2026-11-27T14:15:03.000Z",
  }
  const bus = new TaskEventBus()
  const received = []
  bus.subscribe((event) => received.push(event))

  const first = createTaskDomainEvent(createReminderTriggeredEventInput(input))
  const replay = createTaskDomainEvent(createReminderTriggeredEventInput(input))
  assert.equal(first.eventId, replay.eventId)
  assert.equal(bus.publish(first), true)
  assert.equal(bus.publish(replay), false)
  assert.equal(received.length, 1)
})

test("rejects reminder event inputs without valid identifiers or timestamps", () => {
  assert.throws(() => createReminderTriggeredEventInput({
    taskId: "",
    reminderId: "reminder-1",
    scheduledAt: Date.now(),
    triggeredAt: new Date().toISOString(),
  }))
  assert.throws(() => createReminderTriggeredEventInput({
    taskId: "task-1",
    reminderId: "reminder-1",
    scheduledAt: Number.NaN,
    triggeredAt: "not-a-date",
  }))
})
