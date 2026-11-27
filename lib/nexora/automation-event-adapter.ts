import type { Task } from "./types.ts"
import type { TaskAutomationRule, TaskAutomationRun, AutomationTrigger } from "./automations.ts"
import { runTaskAutomations } from "./automations.ts"
import type { TaskDomainEvent, TaskEventBus } from "./task-events.ts"

export interface AutomationEventAdapterState {
  tasks: Task[]
  automationRules?: TaskAutomationRule[]
  automationRuns?: TaskAutomationRun[]
}
export interface TaskAutomationEventAdapterOptions {
  getState: () => AutomationEventAdapterState
  commit: (tasks: Task[], automationRuns: TaskAutomationRun[]) => void
  publishCommittedChange: (before: Task, after: Task, cause: TaskDomainEvent) => void
}

function toAutomationTrigger(type: TaskDomainEvent["type"]): AutomationTrigger | undefined {
  switch (type) {
    case "task.created": return "task.created"
    case "task.status.changed": return "task.status_changed"
    case "task.completed": return "task.completed"
    case "task.due": return "task.due"
    case "task.due_soon": return "task.due_soon"
    default: return undefined
  }
}

function isWithinDueSoonWindow(task: Task, rule: TaskAutomationRule, occurredAt: string): boolean {
  if (!task.dueDate) return false
  const today = occurredAt.slice(0, 10)
  if (task.dueDate <= today) return false
  const days = Math.max(1, Math.floor(rule.daysBefore ?? 1) || 1)
  const horizon = new Date(`${today}T00:00:00.000Z`)
  horizon.setUTCDate(horizon.getUTCDate() + days)
  return task.dueDate <= horizon.toISOString().slice(0, 10)
}

/**
 * Converts committed task-domain events into automation triggers.
 * Automation-originated events are intentionally non-cascading to prevent
 * recursive rule chains. Run IDs are also checked in persisted state on replay.
 */
export class TaskAutomationEventAdapter {
  private unsubscribe: (() => void) | undefined
  private readonly eventBus: TaskEventBus
  private readonly options: TaskAutomationEventAdapterOptions

  constructor(eventBus: TaskEventBus, options: TaskAutomationEventAdapterOptions) {
    this.eventBus = eventBus
    this.options = options
  }

  start(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.eventBus.subscribe((event) => this.handle(event))
  }
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }
  private handle(event: TaskDomainEvent): void {
    if (event.entityType !== "task" || event.source === "automation") return
    const trigger = toAutomationTrigger(event.type)
    if (!trigger) return

    const state = this.options.getState()
    const task = state.tasks.find((item) => item.id === event.entityId)
    if (!task) return
    const eventRunPrefix = `${event.eventId}:`
    if ((state.automationRuns ?? []).some((run) => run.id.startsWith(eventRunPrefix))) return

    let rules = (state.automationRules ?? []).filter((rule) => rule.enabled && rule.trigger === trigger)
    if (trigger === "task.due_soon") {
      rules = rules.filter((rule) => isWithinDueSoonWindow(task, rule, event.occurredAt))
    }
    if (rules.length === 0) return

    const result = runTaskAutomations(state.tasks, rules, {
      type: trigger,
      taskId: task.id,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
    })
    if (result.runs.length === 0) return

    const after = result.tasks.find((item) => item.id === task.id)
    this.options.commit(result.tasks, [...result.runs, ...(state.automationRuns ?? [])].slice(0, 200))
    if (after && after !== task) this.options.publishCommittedChange(task, after, event)
  }
}
