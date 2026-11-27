import assert from "node:assert/strict"
import test from "node:test"
import { TaskEventBus, createTaskDomainEvent } from "../src/lib/nexora/task-events.ts"
import { TaskEventOutbox } from "../src/lib/nexora/task-event-outbox.ts"

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
}
function makeEvent(eventId = "event-1") {
  return createTaskDomainEvent({
    eventId,
    type: "task.created",
    entityId: "task-1",
    source: "ui",
    occurredAt: "2026-11-27T10:00:00.000Z",
    after: {
      id: "task-1",
      title: "Test task",
      status: "inbox",
      priority: "none",
      createdAt: "2026-11-27T09:00:00.000Z",
      updatedAt: "2026-11-27T09:00:00.000Z",
    },
  })
}
function createDurableBus(outbox) {
  return new TaskEventBus({
    beforeDispatch: (event) => outbox.enqueue(event),
    afterDispatch: (event, succeeded) => {
      if (succeeded) outbox.acknowledge(event.eventId)
      else outbox.markFailed(event.eventId, new Error("subscriber failed"))
    },
  })
}

test("persists an event before handlers run and acknowledges after successful delivery", () => {
  const storage = new MemoryStorage()
  const outbox = new TaskEventOutbox(storage)
  const bus = createDurableBus(outbox)
  const order = []
  bus.subscribe((event) => {
    order.push("handler")
    assert.equal(outbox.getStats().pendingCount, 1)
    assert.equal(outbox.getPendingEvents().length, 1)
  })

  assert.equal(bus.publish(makeEvent()), true)
  order.push("returned")

  assert.deepEqual(order, ["handler", "returned"])
  assert.deepEqual(outbox.getStats(), {
    pendingCount: 0,
    failedCount: 0,
    completedRemembered: 1,
    oldestPendingAt: undefined,
  })
})

test("keeps failed events in durable storage and retries after backoff", () => {
  const storage = new MemoryStorage()
  let now = Date.parse("2026-11-27T10:00:00.000Z")
  const outbox = new TaskEventOutbox(storage, { now: () => now, baseRetryDelayMs: 1_000 })
  const failedBus = createDurableBus(outbox)
  failedBus.subscribe(() => { throw new Error("temporary consumer error") })

  const event = makeEvent("retry-me")
  failedBus.publish(event)
  assert.deepEqual(outbox.getStats(), {
    pendingCount: 1,
    failedCount: 1,
    completedRemembered: 0,
    oldestPendingAt: new Date(now).toISOString(),
  })
  assert.equal(outbox.getPendingEvents(now).length, 0)
  assert.equal(outbox.getPendingEvents(now + 999).length, 0)
  assert.equal(outbox.getPendingEvents(now + 1_000).length, 1)

  now += 1_000
  const restoredOutbox = new TaskEventOutbox(storage, { now: () => now, baseRetryDelayMs: 1_000 })
  const restoredBus = createDurableBus(restoredOutbox)
  let delivered = 0
  restoredBus.subscribe(() => { delivered += 1 })
  assert.equal(restoredBus.redeliver(restoredOutbox.getPendingEvents(now)[0]), true)
  assert.equal(delivered, 1)
  assert.equal(restoredOutbox.getStats().pendingCount, 0)
  assert.equal(restoredOutbox.getStats().completedRemembered, 1)
})

test("replayed completed event IDs are suppressed across outbox instances", () => {
  const storage = new MemoryStorage()
  const first = new TaskEventOutbox(storage)
  const bus = createDurableBus(first)
  bus.subscribe(() => {})
  const event = makeEvent("already-done")
  assert.equal(bus.publish(event), true)

  const restored = new TaskEventOutbox(storage)
  const restoredBus = createDurableBus(restored)
  let calls = 0
  restoredBus.subscribe(() => { calls += 1 })
  assert.equal(restoredBus.redeliver(event), false)
  assert.equal(calls, 0)
})

test("pending event survives recreating the outbox and bus before its handler runs", () => {
  const storage = new MemoryStorage()
  const first = new TaskEventOutbox(storage)
  assert.equal(first.enqueue(makeEvent("survive-restart")), true)

  const restored = new TaskEventOutbox(storage)
  const bus = createDurableBus(restored)
  let calls = 0
  bus.subscribe((event) => {
    assert.equal(event.eventId, "survive-restart")
    calls += 1
  })
  const pending = restored.getPendingEvents()
  assert.equal(bus.redeliver(pending[0]), true)
  assert.equal(calls, 1)
  assert.equal(restored.getStats().pendingCount, 0)
})

test("uses exponential retry delay with a configured upper bound", () => {
  const storage = new MemoryStorage()
  let now = 100_000
  const outbox = new TaskEventOutbox(storage, {
    now: () => now,
    baseRetryDelayMs: 500,
    maxRetryDelayMs: 1_500,
  })
  const bus = createDurableBus(outbox)
  bus.subscribe(() => { throw new Error("nope") })
  const event = makeEvent("backoff")
  bus.publish(event)

  assert.equal(outbox.getPendingEvents(now + 499).length, 0)
  assert.equal(outbox.getPendingEvents(now + 500).length, 1)
  now += 500
  bus.redeliver(outbox.getPendingEvents(now)[0])
  assert.equal(outbox.getPendingEvents(now + 999).length, 0)
  assert.equal(outbox.getPendingEvents(now + 1_000).length, 1)
})

test("does not overwrite corrupted outbox data", () => {
  const storage = new MemoryStorage()
  storage.setItem("nexora-task-event-outbox-v1", "{broken")
  const outbox = new TaskEventOutbox(storage)
  assert.throws(() => outbox.getStats(), /not valid JSON/)
  assert.equal(storage.getItem("nexora-task-event-outbox-v1"), "{broken")
})

test("enforces the pending queue capacity without discarding existing events", () => {
  const storage = new MemoryStorage()
  const outbox = new TaskEventOutbox(storage, { maxPendingEvents: 1 })
  outbox.enqueue(makeEvent("one"))
  assert.throws(() => outbox.enqueue(makeEvent("two")), /outbox is full/)
  assert.deepEqual(outbox.getPendingEvents().map((event) => event.eventId), ["one"])
})

test("event bus retries a handler failure without breaking other subscribers", () => {
  const storage = new MemoryStorage()
  const outbox = new TaskEventOutbox(storage)
  const bus = createDurableBus(outbox)
  const calls = []
  bus.subscribe(() => { throw new Error("subscriber failure") })
  bus.subscribe((event) => calls.push(event.eventId))

  const event = makeEvent("one-handler-fails")
  assert.equal(bus.publish(event), true)
  assert.deepEqual(calls, ["one-handler-fails"])
  assert.equal(outbox.getStats().pendingCount, 1)
  assert.equal(bus.getHandlerErrors().length, 1)

  // A new consumer session retries the pending event and acknowledges it.
  const secondOutbox = new TaskEventOutbox(storage)
  const secondBus = createDurableBus(secondOutbox)
  let secondCalls = 0
  secondBus.subscribe(() => { secondCalls += 1 })
  secondBus.redeliver(secondOutbox.getPendingEvents(Date.now() + 10_000)[0])
  assert.equal(secondCalls, 1)
  assert.equal(secondOutbox.getStats().pendingCount, 0)
})
