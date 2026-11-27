import type { Task, TaskReminder } from "./types"

const MAX_REMINDER_LATENESS_MS = 15 * 60 * 1000

function parseLocalDateTime(value: string): number | null {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

/** Resolves a reminder to an absolute timestamp using the task's start or due date. */
export function getTaskReminderTimestamp(task: Task, reminder: TaskReminder): number | null {
  if (!reminder.enabled) return null
  if (reminder.at) return parseLocalDateTime(reminder.at)
  if (reminder.minutesBefore == null || !Number.isFinite(reminder.minutesBefore) || reminder.minutesBefore < 0) {
    return null
  }

  const anchor = reminder.anchor ?? "start"
  const anchorValue = anchor === "due"
    ? (task.dueDate ? `${task.dueDate}T09:00` : undefined)
    : (task.startAt ?? (task.scheduledDate ? `${task.scheduledDate}T09:00` : undefined))
  if (!anchorValue) return null

  const timestamp = parseLocalDateTime(anchorValue)
  return timestamp == null ? null : timestamp - reminder.minutesBefore * 60_000
}

export interface DueTaskReminder {
  task: Task
  reminder: TaskReminder
  scheduledAt: number
}

/**
 * Returns reminders due now, ignoring stale reminders and already delivered ones.
 * The short lateness window prevents a reopened app from flooding the user with old alerts.
 */
export function getDueTaskReminders(
  tasks: Task[],
  now = Date.now(),
  maxLatenessMs = MAX_REMINDER_LATENESS_MS,
): DueTaskReminder[] {
  const due: DueTaskReminder[] = []
  for (const task of tasks) {
    if (task.archived || task.deletedAt || task.status === "done" || task.status === "cancelled") continue
    for (const reminder of task.reminders ?? []) {
      const scheduledAt = getTaskReminderTimestamp(task, reminder)
      if (scheduledAt == null || scheduledAt > now || scheduledAt < now - maxLatenessMs) continue
      if (reminder.lastTriggeredAt) continue
      due.push({ task, reminder, scheduledAt })
    }
  }
  return due.sort((a, b) => a.scheduledAt - b.scheduledAt)
}
