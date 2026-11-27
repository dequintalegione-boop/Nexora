import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_POMODORO_SETTINGS,
  getNextPomodoroPhase,
  getPomodoroPhaseDurationMs,
  normalizePomodoroSettings,
} from "./pomodoro.ts"

test("normalizes Pomodoro defaults and clamps invalid settings", () => {
  assert.deepEqual(normalizePomodoroSettings(), DEFAULT_POMODORO_SETTINGS)
  assert.deepEqual(
    normalizePomodoroSettings({
      focusMinutes: 0,
      shortBreakMinutes: 100,
      longBreakMinutes: 12.4,
      cyclesBeforeLongBreak: 99,
      autoStartNext: true,
    }),
    {
      focusMinutes: 1,
      shortBreakMinutes: 60,
      longBreakMinutes: 12,
      cyclesBeforeLongBreak: 12,
      autoStartNext: true,
    },
  )
})

test("uses the configured duration for every phase", () => {
  const settings = normalizePomodoroSettings({
    focusMinutes: 30,
    shortBreakMinutes: 7,
    longBreakMinutes: 20,
  })
  assert.equal(getPomodoroPhaseDurationMs("focus", settings), 30 * 60_000)
  assert.equal(getPomodoroPhaseDurationMs("short_break", settings), 7 * 60_000)
  assert.equal(getPomodoroPhaseDurationMs("long_break", settings), 20 * 60_000)
})

test("cycles focus into short breaks and then a long break", () => {
  assert.deepEqual(getNextPomodoroPhase("focus", 0, 4), {
    phase: "short_break",
    completedFocusCycles: 1,
  })
  assert.deepEqual(getNextPomodoroPhase("focus", 3, 4), {
    phase: "long_break",
    completedFocusCycles: 4,
  })
  assert.deepEqual(getNextPomodoroPhase("long_break", 4, 4), {
    phase: "focus",
    completedFocusCycles: 0,
  })
})

test("short breaks return to focus without resetting the cycle count", () => {
  assert.deepEqual(getNextPomodoroPhase("short_break", 2, 4), {
    phase: "focus",
    completedFocusCycles: 2,
  })
})
