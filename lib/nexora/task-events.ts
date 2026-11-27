import type { Task } from "./types"
import { createBrowserTaskEventOutbox } from "./task-event-outbox.ts"

export type TaskEventSource = "ui" | "automation" | "recurrence" | "timer" | "import" | "system"

export type TaskDomainEventType =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "task.restored"
  | "task.permanently_deleted"
  | "task.moved"
  | "task.status.changed"
  | "task.completed"
  | "task.uncompleted"
  | "task.archived"
  | "task.unarchived"
  | "task.scheduled.changed"
  | "task.due.changed"
  /** Scheduler evaluation events consumed by task automations. */
  | "task.due"
  | "task.due_soon"
  | "task.priority.changed"
  | "task.tags.changed"
  | "task.contexts.changed"
  | "task.projects.changed"
  | "task.reminders.changed"
  | "task.dependencies.changed"
  | "task.recurrence.changed"
  | "recurring.instance.completed"
  | "recurring.instance.skipped"
  | "time.started"
  | "time.paused"
  | "time.resumed"
  | "time.stopped"
  | "time.session.corrected"
  | "pomodoro.started"
  | "pomodoro.completed"
  | "pomodoro.interrupted"
  | "reminder.triggered"

/** A deliberately small event snapshot: descriptions, notes and reminder content stay out of the event stream. */
export type TaskEventSnapshot = Pick<
  Task,
  | "id"
  | "title"
  | "status"
  | "priority"
  | "dueDate"
  | "scheduledDate"
  | "startAt"
  | "endAt"
  | "parentId"
  | "projectId"
  | "projectIds"
  | "tags"
  | "contexts"
  | "dependsOn"
  | "archived"
  | "deletedAt"
  | "recurrenceParentId"
  | "occurrenceDate"
  | "repeat"
  | "recurrenceRule"
>

export interface TaskDomainEvent {
  eventId: string
  type: TaskDomainEventType
  occurredAt: string
  entityType: "task" | "timer" | "time_session" | "pomodoro" | "reminder"
  entityId: string
  before?: TaskEventSnapshot
  after?: TaskEventSnapshot
  source: TaskEventSource
  correlationId: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface CreateTaskDomainEventInput {
  type: TaskDomainEventType
  entityId: string
  entityType?: TaskDomainEvent["entityType"]
  before?: Task
  after?: Task
  source?: TaskEventSource
  correlationId?: string
  eventId?: string
  occurredAt?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

function snapshot(task: Task | undefined): TaskEventSnapshot | undefined {
  if (!task) return undefined
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    startAt: task.startAt,
    endAt: task.endAt,
    parentId: task.parentId,
    projectId: task.projectId,
    projectIds: task.projectIds ? [...task.projectIds] : undefined,
    tags: task.tags ? [...task.tags] : undefined,
    contexts: task.contexts ? [...task.contexts] : undefined,
    dependsOn: task.dependsOn ? [...task.dependsOn] : undefined,
    archived: task.archived,
    deletedAt: task.deletedAt,
    recurrenceParentId: task.recurrenceParentId,
    occurrenceDate: task.occurrenceDate,
    repeat: task.repeat,
    recurrenceRule: task.recurrenceRule
      ? {
          ...task.recurrenceRule,
          weekdays: task.recurrenceRule.weekdays ? [...task.recurrenceRule.weekdays] : undefined,
          byDay: task.recurrenceRule.byDay?.map((item) => ({ ...item })),
          byMonthDay: task.recurrenceRule.byMonthDay ? [...task.recurrenceRule.byMonthDay] : undefined,
          byMonth: task.recurrenceRule.byMonth ? [...task.recurrenceRule.byMonth] : undefined,
          excludeDates: task.recurrenceRule.excludeDates ? [...task.recurrenceRule.excludeDates] : undefined,
        }
      : undefined,
  }
}

function createEventId(): string {
  return "task_evt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10)
}

export function createTaskDomainEvent(input: CreateTaskDomainEventInput): TaskDomainEvent {
  const eventId = input.eventId ?? createEventId()
  return {
    eventId,
    type: input.type,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    entityType: input.entityType ?? "task",
    entityId: input.entityId,
    before: snapshot(input.before),
    after: snapshot(input.after),
    source: input.source ?? "ui",
    correlationId: input.correlationId ?? eventId,
    metadata: input.metadata ? { ...input.metadata } : undefined,
  }
}

export type TaskDomainEventHandler = (event: TaskDomainEvent) => void

export interface TaskEventBusOptions {
  maxRememberedEvents?: number
  maxHandlerErrors?: number
  onHandlerError?: (error: unknown, event: TaskDomainEvent) => void
  /** Persist an event before dispatch. Return false to suppress an already completed replay. */
  beforeDispatch?: (event: TaskDomainEvent) => boolean | void
  /** Called after all handlers finish; failed deliveries remain pending in the durable outbox. */
  afterDispatch?: (event: TaskDomainEvent, succeeded: boolean) => void
  onPersistenceError?: (error: unknown, event: TaskDomainEvent) => void
}

export interface TaskEventHandlerError {
  eventId: string
  type: TaskDomainEventType
  message: string
}

/**
 * Synchronous, in-process event bus. It dispatches only after callers publish,
 * isolates handler failures, queues nested publications and suppresses duplicate event IDs.
 */
export class TaskEventBus {
  private readonly handlers = new Map<number, TaskDomainEventHandler>()
  private readonly handledIds = new Set<string>()
  private readonly handledOrder: string[] = []
  private readonly queue: Array<{ event: TaskDomainEvent; persisted: boolean }> = []
  private readonly handlerErrors: TaskEventHandlerError[] = []
  private readonly maxRememberedEvents: number
  private readonly maxHandlerErrors: number
  private readonly onHandlerError?: TaskEventBusOptions["onHandlerError"]
  private readonly beforeDispatch?: TaskEventBusOptions["beforeDispatch"]
  private readonly afterDispatch?: TaskEventBusOptions["afterDispatch"]
  private readonly onPersistenceError?: TaskEventBusOptions["onPersistenceError"]
  private nextHandlerId = 1
  private dispatching = false

  constructor(options: TaskEventBusOptions = {}) {
    this.maxRememberedEvents = Math.max(100, Math.floor(options.maxRememberedEvents ?? 5_000))
    this.maxHandlerErrors = Math.max(1, Math.floor(options.maxHandlerErrors ?? 50))
    this.onHandlerError = options.onHandlerError
    this.beforeDispatch = options.beforeDispatch
    this.afterDispatch = options.afterDispatch
    this.onPersistenceError = options.onPersistenceError
  }

  subscribe(handler: TaskDomainEventHandler): () => void {
    const id = this.nextHandlerId++
    this.handlers.set(id, handler)
    return () => this.handlers.delete(id)
  }

  publish(event: TaskDomainEvent): boolean {
    return this.accept(event, true)
  }

  /** Re-dispatch a persisted pending event, bypassing only this instance's in-memory dedupe. */
  redeliver(event: TaskDomainEvent): boolean {
    return this.accept(event, false)
  }

  private accept(event: TaskDomainEvent, remember: boolean): boolean {
    if (!event.eventId || (remember && this.handledIds.has(event.eventId))) return false

    if (remember) {
      this.handledIds.add(event.eventId)
      this.handledOrder.push(event.eventId)
      while (this.handledOrder.length > this.maxRememberedEvents) {
        const oldest = this.handledOrder.shift()
        if (oldest) this.handledIds.delete(oldest)
      }
    }

    let persisted = false
    try {
      const decision = this.beforeDispatch?.(event)
      if (decision === false) return false
      persisted = decision === true
    } catch (error) {
      try {
        this.onPersistenceError?.(error, event)
      } catch {
        // Persistence reporting must not interrupt an already committed user action.
      }
    }

    this.queue.push({ event, persisted })
    if (this.dispatching) return true

    this.dispatching = true
    try {
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!
        const current = queued.event
        let succeeded = true
        for (const handler of [...this.handlers.values()]) {
          try {
            handler(current)
          } catch (error) {
            succeeded = false
            const message = error instanceof Error ? error.message : String(error)
            this.handlerErrors.push({ eventId: current.eventId, type: current.type, message })
            while (this.handlerErrors.length > this.maxHandlerErrors) this.handlerErrors.shift()
            try {
              this.onHandlerError?.(error, current)
            } catch {
              // An error reporter must not interrupt delivery to other subscribers.
            }
          }
        }
        if (queued.persisted) {
          try {
            this.afterDispatch?.(current, succeeded)
          } catch (error) {
            try {
              this.onPersistenceError?.(error, current)
            } catch {
              // Persistence reporting must not interrupt delivery to other subscribers.
            }
          }
        }
      }
    } finally {
      this.dispatching = false
    }
    return true
  }

  getHandlerErrors(): readonly TaskEventHandlerError[] {
    return this.handlerErrors.map((item) => ({ ...item }))
  }

  clearHandlerErrors(): void {
    this.handlerErrors.length = 0
  }
}

const taskEventOutbox = createBrowserTaskEventOutbox()

export const taskEventBus = new TaskEventBus({
  beforeDispatch: (event) => taskEventOutbox?.enqueue(event),
  afterDispatch: (event, succeeded) => {
    if (!taskEventOutbox) return
    if (succeeded) taskEventOutbox.acknowledge(event.eventId)
    else taskEventOutbox.markFailed(event.eventId, new Error("One or more domain event subscribers failed"))
  },
  onPersistenceError: (error, event) => {
    console.error("Nexora task event outbox persistence failed:", event.eventId, error)
  },
})

/** Replay queued events after consumers have subscribed (for example after app hydration). */
export function replayPendingTaskEvents(now = Date.now()): number {
  if (!taskEventOutbox) return 0
  let pending: TaskDomainEvent[]
  try {
    pending = taskEventOutbox.getPendingEvents(now)
  } catch (error) {
    console.error("Nexora task event outbox could not be read:", error)
    return 0
  }
  let replayed = 0
  for (const event of pending) {
    if (taskEventBus.redeliver(event)) replayed += 1
  }
  return replayed
}

/** Read-only health information for diagnostics and a future settings UI. */
export function getTaskEventOutboxStats(): {
  pendingCount: number
  failedCount: number
  completedRemembered: number
  oldestPendingAt?: string
} {
  if (!taskEventOutbox) return { pendingCount: 0, failedCount: 0, completedRemembered: 0 }
  try {
    return taskEventOutbox.getStats()
  } catch (error) {
    console.error("Nexora task event outbox stats unavailable:", error)
    return { pendingCount: 0, failedCount: 0, completedRemembered: 0 }
  }
}
