import assert from "node:assert/strict"
import test from "node:test"
import { TaskAutomationEventAdapter } from "../src/lib/nexora/automation-event-adapter.ts"
import { createTaskDomainEvent, TaskEventBus } from "../src/lib/nexora/task-events.ts"

function makeTask(patch = {}) {
  return {
    id: "task-1", title: "Задача", status: "inbox", priority: "none",
    createdAt: "2026-11-27T08:00:00.000Z", updatedAt: "2026-11-27T08:00:00.000Z",
    tags: [], ...patch,
  }
}
function makeRule(patch = {}) {
  return {
    id: "rule-1", name: "Правило", enabled: true, trigger: "task.created",
    conditions: [], action: { type: "set_priority", value: "critical" },
    createdAt: "2026-11-27T08:00:00.000Z", updatedAt: "2026-11-27T08:00:00.000Z",
    ...patch,
  }
}
function createHarness(rules = []) {
  const state = { tasks: [makeTask()], automationRules: rules, automationRuns: [] }
  const bus = new TaskEventBus()
  const committedChanges = []
  const adapter = new TaskAutomationEventAdapter(bus, {
    getState: () => state,
    commit: (tasks, automationRuns) => {
      state.tasks = tasks
      state.automationRuns = automationRuns
    },
    publishCommittedChange: (before, after, cause) => {
      committedChanges.push({
        before, after,
        committedPriority: state.tasks.find((task) => task.id === after.id)?.priority,
        causeCorrelationId: cause.correlationId,
      })
      const type = before.status !== after.status ? "task.status.changed"
        : before.priority !== after.priority ? "task.priority.changed" : "task.updated"
      bus.publish(createTaskDomainEvent({
        eventId: "automation-follow-up-" + cause.eventId, type, entityId: after.id,
        before: after, after, source: "automation", correlationId: cause.correlationId,
        occurredAt: cause.occurredAt,
      }))
    },
  })
  adapter.start()
  return { state, bus, adapter, committedChanges }
}
function publish(bus, input) {
  return bus.publish(createTaskDomainEvent(input))
}

test("runs task.created automation after commit and records a deterministic run", () => {
  const h = createHarness([makeRule()])
  publish(h.bus, {
    eventId: "created-event", type: "task.created", entityId: "task-1",
    after: h.state.tasks[0], source: "ui", occurredAt: "2026-11-27T09:00:00.000Z",
  })
  assert.equal(h.state.tasks[0].priority, "critical")
  assert.equal(h.state.automationRuns.length, 1)
  assert.equal(h.state.automationRuns[0].id, "created-event:rule-1")
  assert.equal(h.committedChanges[0].committedPriority, "critical")
  assert.equal(h.committedChanges[0].causeCorrelationId, "created-event")
})

test("maps status and completion domain events to their matching triggers", () => {
  const h = createHarness([
    makeRule({ id: "status", trigger: "task.status_changed", action: { type: "add_tag", value: "status" } }),
    makeRule({ id: "completed", trigger: "task.completed", action: { type: "add_tag", value: "completed" } }),
  ])
  publish(h.bus, {
    eventId: "status-event", type: "task.status.changed", entityId: "task-1",
    after: h.state.tasks[0], source: "ui", occurredAt: "2026-11-27T09:00:00.000Z",
  })
  publish(h.bus, {
    eventId: "completed-event", type: "task.completed", entityId: "task-1",
    after: h.state.tasks[0], source: "ui", occurredAt: "2026-11-27T09:01:00.000Z",
  })
  assert.deepEqual(h.state.tasks[0].tags, ["status", "completed"])
  assert.deepEqual(h.state.automationRuns.map((run) => run.ruleId), ["completed", "status"])
})

test("does not cascade automation-generated changes into another rule", () => {
  const h = createHarness([
    makeRule({ id: "created", trigger: "task.created", action: { type: "set_status", value: "planned" } }),
    makeRule({ id: "status", trigger: "task.status_changed", action: { type: "add_tag", value: "must-not-run" } }),
  ])
  publish(h.bus, {
    eventId: "non-cascade", type: "task.created", entityId: "task-1",
    after: h.state.tasks[0], source: "ui", occurredAt: "2026-11-27T09:00:00.000Z",
  })
  assert.equal(h.state.tasks[0].status, "planned")
  assert.deepEqual(h.state.tasks[0].tags, [])
  assert.deepEqual(h.state.automationRuns.map((run) => run.ruleId), ["created"])
})

test("persisted run IDs suppress replay after the event bus is recreated", () => {
  const h = createHarness([makeRule({ action: { type: "add_tag", value: "once" } })])
  const input = {
    eventId: "replayed-event", type: "task.created", entityId: "task-1",
    after: h.state.tasks[0], source: "ui", occurredAt: "2026-11-27T09:00:00.000Z",
  }
  publish(h.bus, input)
  h.adapter.stop()
  const bus = new TaskEventBus()
  const adapter = new TaskAutomationEventAdapter(bus, {
    getState: () => h.state,
    commit: (tasks, runs) => { h.state.tasks = tasks; h.state.automationRuns = runs },
    publishCommittedChange: () => { throw new Error("replay must not commit a second change") },
  })
  adapter.start()
  publish(bus, input)
  assert.deepEqual(h.state.tasks[0].tags, ["once"])
  assert.equal(h.state.automationRuns.length, 1)
})

test("due_soon evaluates each rule against its own daysBefore window", () => {
  const task = makeTask({ dueDate: "2026-12-05" })
  const h = createHarness([
    makeRule({ id: "two-days", trigger: "task.due_soon", daysBefore: 2, action: { type: "add_tag", value: "short" } }),
    makeRule({ id: "seven-days", trigger: "task.due_soon", daysBefore: 7, action: { type: "add_tag", value: "long" } }),
  ])
  h.state.tasks = [task]
  publish(h.bus, {
    eventId: "due-soon", type: "task.due_soon", entityId: "task-1",
    after: task, source: "system", occurredAt: "2026-11-30T09:00:00.000Z",
  })
  assert.deepEqual(h.state.tasks[0].tags, ["long"])
  assert.deepEqual(h.state.automationRuns.map((run) => run.ruleId), ["seven-days"])
})
