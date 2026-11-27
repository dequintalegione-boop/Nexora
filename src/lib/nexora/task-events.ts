import type { Task } from "./types"

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
  | "time.stopped"
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
  entityType: "task" | "time_session" | "pomodoro" | "reminder"
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
  private readonly queue: TaskDomainEvent[] = []
  private readonly handlerErrors: TaskEventHandlerError[] = []
  private readonly maxRememberedEvents: number
  private readonly maxHandlerErrors: number
  private readonly onHandlerError?: TaskEventBusOptions["onHandlerError"]
  private nextHandlerId = 1
  private dispatching = false

  constructor(options: TaskEventBusOptions = {}) {
    this.maxRememberedEvents = Math.max(100, Math.floor(options.maxRememberedEvents ?? 5_000))
    this.maxHandlerErrors = Math.max(1, Math.floor(options.maxHandlerErrors ?? 50))
    this.onHandlerError = options.onHandlerError
  }

  subscribe(handler: TaskDomainEventHandler): () => void {
    const id = this.nextHandlerId++
    this.handlers.set(id, handler)
    return () => this.handlers.delete(id)
  }

  publish(event: TaskDomainEvent): boolean {
    if (!event.eventId || this.handledIds.has(event.eventId)) return false

    this.handledIds.add(event.eventId)
    this.handledOrder.push(event.eventId)
    while (this.handledOrder.length > this.maxRememberedEvents) {
      const oldest = this.handledOrder.shift()
      if (oldest) this.handledIds.delete(oldest)
    }

    this.queue.push(event)
    if (this.dispatching) return true

    this.dispatching = true
    try {
      while (this.queue.length > 0) {
        const current = this.queue.shift()!
        for (const handler of [...this.handlers.values()]) {
          try {
            handler(current)
          } catch (error) {
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

export const taskEventBus = new TaskEventBus()
