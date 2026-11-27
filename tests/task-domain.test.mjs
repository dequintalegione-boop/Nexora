import assert from "node:assert/strict"
import test from "node:test"

import {
  createTaskDomainEvent,
  TaskEventBus,
} from "../src/lib/nexora/task-events.ts"
import {
  createTaskRepository,
  DuplicateTaskIdError,
} from "../src/lib/nexora/task-repository.ts"
import { createTaskService } from "../src/lib/nexora/task-service.ts"

function makeTask(id, patch = {}) {
  return {
    id,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    title: id,
    status: "inbox",
    priority: "none",
    ...patch,
  }
}

function createHarness(initial = []) {
  let tasks = [...initial]
  let sequence = 0
  const repository = createTaskRepository(
    () => tasks,
    (next) => { tasks = next },
  )
  const bus = new TaskEventBus()
  const service = createTaskService(repository, bus, {
    now: () => "2026-01-02T10:00:00.000Z",
    createId: (prefix) => prefix + "_" + (++sequence),
  })
  return {
    repository,
    bus,
    service,
    read: () => tasks,
  }
}

test("task repository reads and commits through the supplied canonical state adapter", () => {
  const first = makeTask("one")
  const harness = createHarness([first])

  assert.equal(harness.repository.getById("one")?.title, "one")
  harness.repository.save(makeTask("two"))
  assert.deepEqual(harness.read().map((task) => task.id), ["two", "one"])

  harness.repository.save(makeTask("one", { title: "updated" }))
  assert.equal(harness.read().length, 2)
  assert.equal(harness.repository.getById("one")?.title, "updated")
  assert.equal(harness.repository.remove("two"), true)
  assert.equal(harness.repository.remove("missing"), false)
  assert.deepEqual(harness.read().map((task) => task.id), ["one"])
})

test("task repository rejects duplicate IDs on replace and transaction commits", () => {
  const harness = createHarness()
  assert.throws(
    () => harness.repository.replaceAll([makeTask("dup"), makeTask("dup")]),
    DuplicateTaskIdError,
  )
  assert.equal(harness.read().length, 0)
  assert.throws(
    () => harness.repository.transact(() => ({
      nextTasks: [makeTask("dup"), makeTask("dup")],
      result: true,
    })),
    DuplicateTaskIdError,
  )
  assert.equal(harness.read().length, 0)
})

test("task event bus deduplicates IDs and queues nested events in order", () => {
  const bus = new TaskEventBus()
  const seen = []
  bus.subscribe((event) => {
    seen.push("first:" + event.type)
    if (event.type === "task.created") {
      bus.publish(createTaskDomainEvent({
        eventId: "nested",
        type: "task.updated",
        entityId: event.entityId,
      }))
    }
  })
  bus.subscribe((event) => seen.push("second:" + event.type))

  const event = createTaskDomainEvent({
    eventId: "same",
    type: "task.created",
    entityId: "task-1",
  })
  assert.equal(bus.publish(event), true)
  assert.equal(bus.publish(event), false)
  assert.deepEqual(seen, [
    "first:task.created",
    "second:task.created",
    "first:task.updated",
    "second:task.updated",
  ])
})

test("task event bus isolates handler errors and continues delivery", () => {
  const bus = new TaskEventBus()
  const seen = []
  bus.subscribe(() => { throw new Error("subscriber failed") })
  bus.subscribe((event) => seen.push(event.eventId))

  const event = createTaskDomainEvent({
    eventId: "event-with-error",
    type: "task.created",
    entityId: "task-1",
  })
  assert.equal(bus.publish(event), true)
  assert.deepEqual(seen, ["event-with-error"])
  assert.deepEqual(bus.getHandlerErrors(), [{
    eventId: "event-with-error",
    type: "task.created",
    message: "subscriber failed",
  }])
})

test("task service publishes create and update events only after repository writes", () => {
  const harness = createHarness()
  const observed = []
  harness.bus.subscribe((event) => {
    observed.push({
      type: event.type,
      storedTitle: harness.repository.getById(event.entityId)?.title,
      afterTitle: event.after?.title,
    })
  })

  const created = makeTask("task-1", { description: "private task description" })
  harness.service.create(created, { source: "ui", correlationId: "command-1" })

  assert.deepEqual(observed[0], {
    type: "task.created",
    storedTitle: "task-1",
    afterTitle: "task-1",
  })
  assert.equal("description" in observed[0], false)

  const updated = harness.service.update("task-1", { title: "renamed" })
  assert.equal(updated?.title, "renamed")
  assert.deepEqual(observed[1], {
    type: "task.updated",
    storedTitle: "renamed",
    afterTitle: "renamed",
  })
  assert.equal("description" in (observed[1] ?? {}), false)
  assert.equal("description" in (harness.bus.getHandlerErrors()[0] ?? {}), false)
})

test("task service emits typed status and field-change events with a shared correlation ID", () => {
  const harness = createHarness([makeTask("task-1")])
  const events = []
  harness.bus.subscribe((event) => events.push(event))

  harness.service.update("task-1", {
    status: "done",
    priority: "high",
    dueDate: "2026-01-10",
    tags: ["urgent"],
    projectIds: ["project-1"],
  }, { correlationId: "status-command", source: "automation" })

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "task.updated",
      "task.status.changed",
      "task.completed",
      "task.due.changed",
      "task.priority.changed",
      "task.tags.changed",
      "task.projects.changed",
    ],
  )
  assert.ok(events.every((event) => event.correlationId === "status-command"))
  assert.ok(events.every((event) => event.source === "automation"))
  assert.equal(events[0].after.description, undefined)
})

test("task service keeps history for archive, trash and restore commands", () => {
  const harness = createHarness([makeTask("task-1")])
  const events = []
  harness.bus.subscribe((event) => events.push(event.type))

  assert.equal(harness.service.archive("task-1"), true)
  assert.equal(harness.repository.getById("task-1")?.archived, true)
  assert.equal(harness.repository.getById("task-1")?.history?.at(-1)?.change, "Задача архивирована")

  assert.equal(harness.service.moveToTrash("task-1"), true)
  assert.ok(harness.repository.getById("task-1")?.deletedAt)
  assert.equal(harness.repository.getById("task-1")?.history?.at(-1)?.change, "Задача перемещена в корзину")

  assert.equal(harness.service.restore("task-1"), true)
  assert.equal(harness.repository.getById("task-1")?.archived, false)
  assert.equal(harness.repository.getById("task-1")?.deletedAt, undefined)
  assert.equal(harness.repository.getById("task-1")?.history?.at(-1)?.change, "Задача восстановлена")
  assert.ok(events.includes("task.archived"))
  assert.ok(events.includes("task.deleted"))
  assert.ok(events.includes("task.restored"))
})

test("task service validates parent/dependency cycles and removes broken links on hard delete", () => {
  const harness = createHarness([
    makeTask("parent"),
    makeTask("child", { parentId: "parent", dependsOn: ["parent"] }),
  ])

  assert.equal(harness.service.setParent("parent", "child"), false)
  assert.equal(harness.service.addDependency("parent", "child"), false)
  assert.equal(harness.service.removeDependency("child", "parent"), true)
  assert.equal(harness.service.permanentlyDelete("parent"), true)

  assert.equal(harness.repository.getById("parent"), undefined)
  assert.equal(harness.repository.getById("child")?.parentId, undefined)
  assert.deepEqual(harness.repository.getById("child")?.dependsOn, [])
})


test("time tracking and Pomodoro lifecycle events share stable correlation IDs", () => {
  const bus = new TaskEventBus()
  const received = []
  bus.subscribe((event) => received.push(event))

  const lifecycle = [
    {
      eventId: "time-start",
      type: "time.started",
      entityType: "timer",
      entityId: "timer-1",
      metadata: { timerId: "timer-1", taskId: "task-1", kind: "focus" },
    },
    {
      eventId: "time-pause",
      type: "time.paused",
      entityType: "timer",
      entityId: "timer-1",
      metadata: { timerId: "timer-1", reason: "user" },
    },
    {
      eventId: "time-resume",
      type: "time.resumed",
      entityType: "timer",
      entityId: "timer-1",
      metadata: { timerId: "timer-1" },
    },
    {
      eventId: "time-stop",
      type: "time.stopped",
      entityType: "time_session",
      entityId: "session-1",
      metadata: { timerId: "timer-1", durationMinutes: 25 },
    },
    {
      eventId: "session-corrected",
      type: "time.session.corrected",
      entityType: "time_session",
      entityId: "session-1",
      metadata: { previousDurationMinutes: 25, durationMinutes: 30, durationDeltaMinutes: 5 },
    },
    {
      eventId: "pomodoro-start",
      type: "pomodoro.started",
      entityType: "pomodoro",
      entityId: "pomodoro-1",
      metadata: { phase: "focus", phaseDurationMs: 1_500_000 },
    },
    {
      eventId: "pomodoro-complete",
      type: "pomodoro.completed",
      entityType: "pomodoro",
      entityId: "pomodoro-1",
      metadata: { phase: "focus", sessionId: "session-1" },
    },
    {
      eventId: "pomodoro-interrupt",
      type: "pomodoro.interrupted",
      entityType: "pomodoro",
      entityId: "pomodoro-2",
      metadata: { phase: "short_break", reason: "timer_stopped" },
    },
  ]

  for (const item of lifecycle) {
    assert.equal(bus.publish(createTaskDomainEvent({
      ...item,
      source: "timer",
      correlationId: "pomodoro-1",
      occurredAt: "2026-01-02T10:00:00.000Z",
    })), true)
  }

  assert.deepEqual(received.map((event) => event.type), lifecycle.map((event) => event.type))
  assert.ok(received.every((event) => event.source === "timer"))
  assert.ok(received.every((event) => event.correlationId === "pomodoro-1"))
  assert.equal(received[0].entityType, "timer")
  assert.equal(received[3].entityType, "time_session")
  assert.equal(received[5].entityType, "pomodoro")
})
