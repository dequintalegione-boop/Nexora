import type { Task, TaskStatus } from "./types"
import { canAddTaskDependency, canSetTaskParent } from "./task-logic.ts"
import {
  createTaskDomainEvent,
  type TaskDomainEvent,
  type TaskEventSource,
  type TaskEventBus,
} from "./task-events.ts"
import type { TaskRepository } from "./task-repository.ts"

export type TaskServicePatch = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>

export interface TaskCommandContext {
  source?: TaskEventSource
  correlationId?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface TaskServiceOptions {
  now?: () => string
  createId?: (prefix: string) => string
  isDoneStatus?: (status: TaskStatus) => boolean
}

interface ChangedTask {
  before: Task
  after: Task
}

function createDefaultId(prefix: string): string {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9)
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

/**
 * Application service for task commands. Repository writes complete before
 * domain events are published; event handlers can therefore read committed state.
 */
export class TaskService {
  private readonly now: () => string
  private readonly createId: (prefix: string) => string
  private readonly isDoneStatus: (status: TaskStatus) => boolean

  constructor(
    private readonly repository: TaskRepository,
    private readonly eventBus: TaskEventBus,
    options: TaskServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.createId = options.createId ?? createDefaultId
    this.isDoneStatus = options.isDoneStatus ?? ((status) => status === "done")
  }

  create(task: Task, context: TaskCommandContext = {}): Task {
    this.repository.transact((current) => {
      if (current.some((item) => item.id === task.id)) {
        throw new Error("Задача с таким ID уже существует: " + task.id)
      }
      return { nextTasks: [task, ...current], result: undefined }
    })

    this.publish("task.created", task.id, undefined, task, context)
    return task
  }

  update(id: string, patch: TaskServicePatch, context: TaskCommandContext = {}): Task | undefined {
    const now = this.now()
    const changed = this.repository.transact((current) => {
      const before = current.find((task) => task.id === id)
      if (!before) return { nextTasks: current, result: undefined }

      const after: Task = {
        ...before,
        ...patch,
        id: before.id,
        createdAt: before.createdAt,
        updatedAt: now,
      }
      const keys = Object.keys(patch) as Array<keyof TaskServicePatch>
      if (!keys.some((key) => !sameValue(before[key], after[key]))) {
        return { nextTasks: current, result: undefined }
      }

      return {
        nextTasks: current.map((task) => task.id === id ? after : task),
        result: { before, after } satisfies ChangedTask,
      }
    })

    if (!changed) return undefined
    this.publishChanges(changed.before, changed.after, context, now)
    return changed.after
  }

  archive(id: string, context: TaskCommandContext = {}): boolean {
    const current = this.repository.getById(id)
    if (!current || current.archived) return false
    const now = this.now()
    return Boolean(this.update(id, {
      archived: true,
      archivedAt: now,
      history: [...(current.history ?? []), { at: now, change: "Задача архивирована" }].slice(-100),
    }, context))
  }

  restore(id: string, context: TaskCommandContext = {}): boolean {
    const current = this.repository.getById(id)
    if (!current || (!current.archived && !current.deletedAt)) return false
    const now = this.now()
    return Boolean(this.update(id, {
      archived: false,
      archivedAt: undefined,
      deletedAt: undefined,
      history: [...(current.history ?? []), { at: now, change: "Задача восстановлена" }].slice(-100),
    }, context))
  }

  moveToTrash(id: string, context: TaskCommandContext = {}): boolean {
    const current = this.repository.getById(id)
    if (!current || current.deletedAt) return false
    const now = this.now()
    return Boolean(this.update(id, {
      deletedAt: now,
      history: [...(current.history ?? []), { at: now, change: "Задача перемещена в корзину" }].slice(-100),
    }, context))
  }

  permanentlyDelete(id: string, context: TaskCommandContext = {}): boolean {
    const now = this.now()
    const outcome = this.repository.transact((current) => {
      const removed = current.find((task) => task.id === id)
      if (!removed) return { nextTasks: current, result: undefined }

      const changed: ChangedTask[] = []
      const nextTasks = current
        .filter((task) => task.id !== id)
        .map((task) => {
          const after: Task = {
            ...task,
            parentId: task.parentId === id ? undefined : task.parentId,
            dependsOn: task.dependsOn?.filter((dependencyId) => dependencyId !== id),
          }
          if (after.parentId !== task.parentId || !sameValue(after.dependsOn, task.dependsOn)) {
            changed.push({ before: task, after })
          }
          return after
        })

      return { nextTasks, result: { removed, changed } }
    })

    if (!outcome) return false
    const correlationId = context.correlationId ?? this.createId("corr")
    this.eventBus.publish(createTaskDomainEvent({
      type: "task.deleted",
      entityId: id,
      before: outcome.removed,
      source: context.source ?? "ui",
      correlationId,
      occurredAt: now,
      eventId: this.createId("event"),
      metadata: { ...context.metadata, permanent: true },
    }))
    this.eventBus.publish(createTaskDomainEvent({
      type: "task.permanently_deleted",
      entityId: id,
      before: outcome.removed,
      source: context.source ?? "ui",
      correlationId,
      occurredAt: now,
    }))

    for (const item of outcome.changed) {
      this.publishChanges(item.before, item.after, { ...context, correlationId }, now)
    }
    return true
  }

  setParent(id: string, parentId: string | undefined, context: TaskCommandContext = {}): boolean {
    const tasks = this.repository.getAll() as Task[]
    if (!canSetTaskParent(tasks, id, parentId)) return false
    const current = this.repository.getById(id)
    if (!current) return false
    return Boolean(this.update(id, {
      parentId,
      history: [...(current.history ?? []), {
        at: this.now(),
        change: parentId ? "Изменена родительская задача" : "Связь с родителем удалена",
      }].slice(-100),
    }, context))
  }

  addDependency(id: string, dependencyId: string, context: TaskCommandContext = {}): boolean {
    const tasks = this.repository.getAll() as Task[]
    if (!canAddTaskDependency(tasks, id, dependencyId)) return false
    const current = this.repository.getById(id)
    if (!current) return false
    const dependsOn = [...new Set([...(current.dependsOn ?? []), dependencyId])]
    if (dependsOn.length === (current.dependsOn ?? []).length) return false
    return Boolean(this.update(id, {
      dependsOn,
      history: [...(current.history ?? []), { at: this.now(), change: "Добавлена зависимость" }].slice(-100),
    }, context))
  }

  removeDependency(id: string, dependencyId: string, context: TaskCommandContext = {}): boolean {
    const current = this.repository.getById(id)
    if (!current?.dependsOn?.includes(dependencyId)) return false
    return Boolean(this.update(
      id,
      {
        dependsOn: current.dependsOn.filter((item) => item !== dependencyId),
        history: [...(current.history ?? []), { at: this.now(), change: "Удалена зависимость" }].slice(-100),
      },
      context,
    ))
  }

  /**
   * Publish a change that was committed by an outer atomic profile transaction.
   * This is used when the store must coordinate recurrence and automation side effects
   * in the same write before observers are notified.
   */
  publishCommittedChange(
    before: Task,
    after: Task,
    context: TaskCommandContext = {},
    occurredAt = this.now(),
  ): string {
    const correlationId = context.correlationId ?? this.createId("corr")
    this.publishChanges(before, after, { ...context, correlationId }, occurredAt)
    return correlationId
  }

  setStatus(id: string, status: TaskStatus, context: TaskCommandContext = {}): Task | undefined {
    const current = this.repository.getById(id)
    if (!current || current.status === status) return current
    const now = this.now()
    const isDone = this.isDoneStatus(status)
    return this.update(id, {
      status,
      completedAt: isDone ? now : undefined,
      history: [
        ...(current.history ?? []),
        { at: now, change: "Статус → " + status },
      ].slice(-100),
    }, context)
  }

  private publishChanges(
    before: Task,
    after: Task,
    context: TaskCommandContext,
    occurredAt: string,
  ): void {
    const correlationId = context.correlationId ?? this.createId("corr")
    const publish = (type: TaskDomainEvent["type"], metadata?: TaskDomainEvent["metadata"]) => {
      this.eventBus.publish(createTaskDomainEvent({
        type,
        entityId: after.id,
        before,
        after,
        source: context.source ?? "ui",
        correlationId,
        occurredAt,
        eventId: this.createId("event"),
        metadata: metadata ?? context.metadata,
      }))
    }

    publish("task.updated")
    let moved = false

    if (before.status !== after.status) {
      publish("task.status.changed")
      const wasDone = this.isDoneStatus(before.status)
      const isDone = this.isDoneStatus(after.status)
      if (!wasDone && isDone) publish("task.completed")
      if (wasDone && !isDone) publish("task.uncompleted")
    }
    if (before.archived !== after.archived) {
      publish(after.archived ? "task.archived" : "task.unarchived")
    }
    if (before.deletedAt !== after.deletedAt) {
      publish(after.deletedAt ? "task.deleted" : "task.restored")
    }
    if (before.scheduledDate !== after.scheduledDate || before.startAt !== after.startAt || before.endAt !== after.endAt) {
      publish("task.scheduled.changed")
      moved = true
    }
    if (before.dueDate !== after.dueDate) publish("task.due.changed")
    if (before.priority !== after.priority) publish("task.priority.changed")
    if (!sameValue(before.tags, after.tags)) publish("task.tags.changed")
    if (!sameValue(before.contexts, after.contexts)) publish("task.contexts.changed")
    if (
      before.projectId !== after.projectId ||
      !sameValue(before.projectIds, after.projectIds)
    ) {
      publish("task.projects.changed")
      moved = true
    }
    if (!sameValue(before.reminders, after.reminders)) publish("task.reminders.changed")
    if (!sameValue(before.dependsOn, after.dependsOn)) publish("task.dependencies.changed")
    if (
      !sameValue(before.recurrenceRule, after.recurrenceRule) ||
      before.repeat !== after.repeat ||
      !sameValue(before.skippedOccurrences, after.skippedOccurrences)
    ) {
      publish("task.recurrence.changed")
    }
    if (before.parentId !== after.parentId) moved = true
    if (moved) publish("task.moved")
  }

  private publish(
    type: TaskDomainEvent["type"],
    entityId: string,
    before: Task | undefined,
    after: Task | undefined,
    context: TaskCommandContext,
  ): void {
    const eventId = this.createId("event")
    this.eventBus.publish(createTaskDomainEvent({
      type,
      entityId,
      before,
      after,
      source: context.source ?? "ui",
      correlationId: context.correlationId ?? eventId,
      eventId,
      occurredAt: this.now(),
      metadata: context.metadata,
    }))
  }
}

export function createTaskService(
  repository: TaskRepository,
  eventBus: TaskEventBus,
  options: TaskServiceOptions = {},
): TaskService {
  return new TaskService(repository, eventBus, options)
}
