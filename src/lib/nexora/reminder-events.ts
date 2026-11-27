import type { CreateTaskDomainEventInput } from "./task-events.ts"

export interface ReminderTriggeredInput {
  taskId: string
  reminderId: string
  scheduledAt: number
  triggeredAt: string
}

/**
 * Builds a privacy-safe and deterministic domain event for one reminder delivery.
 * The task title, description and reminder contents are intentionally omitted.
 */
export function createReminderTriggeredEventInput(
  input: ReminderTriggeredInput,
): CreateTaskDomainEventInput {
  if (!input.taskId.trim() || !input.reminderId.trim()) {
    throw new Error("Reminder events require taskId and reminderId")
  }

  const scheduledAt = new Date(input.scheduledAt)
  const triggeredAt = new Date(input.triggeredAt)
  if (!Number.isFinite(scheduledAt.getTime()) || !Number.isFinite(triggeredAt.getTime())) {
    throw new Error("Reminder event timestamps must be valid")
  }

  const occurredAt = triggeredAt.toISOString()
  const eventId = `reminder.triggered:${input.taskId}:${input.reminderId}:${occurredAt}`

  return {
    type: "reminder.triggered",
    entityType: "reminder",
    entityId: `${input.taskId}:${input.reminderId}`,
    source: "system",
    eventId,
    correlationId: eventId,
    occurredAt,
    metadata: {
      taskId: input.taskId,
      reminderId: input.reminderId,
      scheduledAt: scheduledAt.toISOString(),
    },
  }
}
