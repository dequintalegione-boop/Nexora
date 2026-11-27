import type { TaskDomainEvent } from "./task-events.ts"

export interface TaskEventOutboxStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface TaskEventOutboxOptions {
  key?: string
  maxPendingEvents?: number
  maxRememberedCompletedEvents?: number
  baseRetryDelayMs?: number
  maxRetryDelayMs?: number
  now?: () => number
}

interface TaskEventOutboxEntry {
  event: TaskDomainEvent
  queuedAt: string
  attempts: number
  lastAttemptAt?: string
  nextAttemptAt?: number
  lastError?: string
}

interface TaskEventOutboxState {
  version: 1
  pending: TaskEventOutboxEntry[]
  completedEventIds: string[]
}

export interface TaskEventOutboxStats {
  pendingCount: number
  failedCount: number
  completedRemembered: number
  oldestPendingAt?: string
}

const DEFAULT_KEY = "nexora-task-event-outbox-v1"
const DEFAULT_MAX_PENDING = 1_000
const DEFAULT_MAX_COMPLETED = 5_000
const DEFAULT_BASE_RETRY_MS = 1_000
const DEFAULT_MAX_RETRY_MS = 5 * 60_000

function emptyState(): TaskEventOutboxState {
  return { version: 1, pending: [], completedEventIds: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTaskDomainEvent(value: unknown): value is TaskDomainEvent {
  if (!isRecord(value)) return false
  return (
    typeof value.eventId === "string" && value.eventId.length > 0 &&
    typeof value.type === "string" &&
    typeof value.occurredAt === "string" &&
    typeof value.entityType === "string" &&
    typeof value.entityId === "string" &&
    typeof value.source === "string" &&
    typeof value.correlationId === "string"
  )
}

function cloneEvent(event: TaskDomainEvent): TaskDomainEvent {
  return JSON.parse(JSON.stringify(event)) as TaskDomainEvent
}

function parseState(raw: string | null, key: string): TaskEventOutboxState {
  if (raw === null) return emptyState()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Outbox data at "${key}" is not valid JSON; original data was left untouched`)
  }

  if (!isRecord(parsed) || parsed.version !== 1 ||
      !Array.isArray(parsed.pending) || !Array.isArray(parsed.completedEventIds)) {
    throw new Error(`Outbox data at "${key}" has an unsupported or invalid format; original data was left untouched`)
  }

  const pending: TaskEventOutboxEntry[] = []
  const pendingIds = new Set<string>()
  for (const rawEntry of parsed.pending) {
    if (
      !isRecord(rawEntry) ||
      !isTaskDomainEvent(rawEntry.event) ||
      typeof rawEntry.queuedAt !== "string" ||
      !Number.isInteger(rawEntry.attempts) ||
      (rawEntry.attempts as number) < 0 ||
      (rawEntry.lastAttemptAt !== undefined && typeof rawEntry.lastAttemptAt !== "string") ||
      (rawEntry.nextAttemptAt !== undefined && typeof rawEntry.nextAttemptAt !== "number") ||
      (rawEntry.lastError !== undefined && typeof rawEntry.lastError !== "string")
    ) {
      throw new Error(`Outbox data at "${key}" contains an invalid pending entry; original data was left untouched`)
    }
    const event = rawEntry.event
    if (pendingIds.has(event.eventId)) {
      throw new Error(`Outbox data at "${key}" contains duplicate event IDs; original data was left untouched`)
    }
    pendingIds.add(event.eventId)
    pending.push({
      event,
      queuedAt: rawEntry.queuedAt,
      attempts: rawEntry.attempts as number,
      lastAttemptAt: rawEntry.lastAttemptAt as string | undefined,
      nextAttemptAt: rawEntry.nextAttemptAt as number | undefined,
      lastError: rawEntry.lastError as string | undefined,
    })
  }

  if (!parsed.completedEventIds.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error(`Outbox data at "${key}" contains invalid completed IDs; original data was left untouched`)
  }

  const completedEventIds = [...new Set(parsed.completedEventIds as string[])]
  if (completedEventIds.some((id) => pendingIds.has(id))) {
    throw new Error(`Outbox data at "${key}" marks an event as both pending and completed; original data was left untouched`)
  }

  return { version: 1, pending, completedEventIds }
}

/**
 * Browser-local durable journal for domain events.
 *
 * The outbox persists an event before dispatch and removes it only after every
 * in-process subscriber completes successfully. Failed deliveries remain queued
 * with bounded exponential backoff. It is intentionally not a server queue:
 * data is local to this browser profile and localStorage has no cross-tab lock.
 */
export class TaskEventOutbox {
  private readonly storage: TaskEventOutboxStorage
  private readonly key: string
  private readonly maxPendingEvents: number
  private readonly maxRememberedCompletedEvents: number
  private readonly baseRetryDelayMs: number
  private readonly maxRetryDelayMs: number
  private readonly now: () => number

  constructor(storage: TaskEventOutboxStorage, options: TaskEventOutboxOptions = {}) {
    this.storage = storage
    this.key = options.key ?? DEFAULT_KEY
    this.maxPendingEvents = Math.max(1, Math.floor(options.maxPendingEvents ?? DEFAULT_MAX_PENDING))
    this.maxRememberedCompletedEvents = Math.max(
      100,
      Math.floor(options.maxRememberedCompletedEvents ?? DEFAULT_MAX_COMPLETED),
    )
    this.baseRetryDelayMs = Math.max(1, Math.floor(options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_MS))
    this.maxRetryDelayMs = Math.max(this.baseRetryDelayMs, Math.floor(options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_MS))
    this.now = options.now ?? Date.now
  }

  /** Persist a new event before dispatch. Returns false for an already completed event. */
  enqueue(event: TaskDomainEvent): boolean {
    if (!isTaskDomainEvent(event)) throw new Error("Cannot enqueue an invalid task domain event")
    const state = this.read()
    if (state.completedEventIds.includes(event.eventId)) return false
    if (state.pending.some((entry) => entry.event.eventId === event.eventId)) return true
    if (state.pending.length >= this.maxPendingEvents) {
      throw new Error(`Task event outbox is full (${this.maxPendingEvents} pending events)`)
    }

    state.pending.push({
      event: cloneEvent(event),
      queuedAt: new Date(this.now()).toISOString(),
      attempts: 0,
    })
    this.write(state)
    return true
  }

  /** Mark delivery complete and retain a bounded set of IDs for replay deduplication. */
  acknowledge(eventId: string): void {
    const state = this.read()
    const exists = state.pending.some((entry) => entry.event.eventId === eventId)
    if (!exists) return
    state.pending = state.pending.filter((entry) => entry.event.eventId !== eventId)
    state.completedEventIds = [...state.completedEventIds.filter((id) => id !== eventId), eventId]
      .slice(-this.maxRememberedCompletedEvents)
    this.write(state)
  }

  /** Keep a failed event pending and schedule the next attempt using exponential backoff. */
  markFailed(eventId: string, error: unknown): void {
    const state = this.read()
    const entry = state.pending.find((item) => item.event.eventId === eventId)
    if (!entry) return
    const now = this.now()
    entry.attempts += 1
    entry.lastAttemptAt = new Date(now).toISOString()
    entry.nextAttemptAt = now + Math.min(
      this.baseRetryDelayMs * (2 ** Math.min(entry.attempts - 1, 20)),
      this.maxRetryDelayMs,
    )
    entry.lastError = (error instanceof Error ? error.message : String(error)).slice(0, 500)
    this.write(state)
  }

  /** Return due events only; callers may safely replay this snapshot while new events are appended. */
  getPendingEvents(now = this.now()): TaskDomainEvent[] {
    return this.read().pending
      .filter((entry) => entry.nextAttemptAt === undefined || entry.nextAttemptAt <= now)
      .map((entry) => cloneEvent(entry.event))
  }

  getStats(): TaskEventOutboxStats {
    const state = this.read()
    return {
      pendingCount: state.pending.length,
      failedCount: state.pending.filter((entry) => entry.attempts > 0).length,
      completedRemembered: state.completedEventIds.length,
      oldestPendingAt: state.pending.map((entry) => entry.queuedAt).sort()[0],
    }
  }

  private read(): TaskEventOutboxState {
    return parseState(this.storage.getItem(this.key), this.key)
  }

  private write(state: TaskEventOutboxState): void {
    this.storage.setItem(this.key, JSON.stringify(state))
  }
}

/** Creates an outbox only in a browser environment with accessible localStorage. */
export function createBrowserTaskEventOutbox(): TaskEventOutbox | undefined {
  try {
    if (typeof window === "undefined") return undefined
    const storage = window.localStorage
    // Probe access eagerly so restricted storage modes degrade to an in-memory bus.
    storage.getItem(DEFAULT_KEY)
    return new TaskEventOutbox(storage)
  } catch {
    return undefined
  }
}
