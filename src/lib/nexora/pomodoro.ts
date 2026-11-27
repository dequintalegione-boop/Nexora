import type { ActivePomodoroState, PomodoroPhase, PomodoroSettings } from "./types"

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartNext: false,
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function normalizePomodoroSettings(
  value?: Partial<PomodoroSettings> | null,
): PomodoroSettings {
  return {
    focusMinutes: boundedInteger(value?.focusMinutes, DEFAULT_POMODORO_SETTINGS.focusMinutes, 1, 180),
    shortBreakMinutes: boundedInteger(value?.shortBreakMinutes, DEFAULT_POMODORO_SETTINGS.shortBreakMinutes, 1, 60),
    longBreakMinutes: boundedInteger(value?.longBreakMinutes, DEFAULT_POMODORO_SETTINGS.longBreakMinutes, 1, 90),
    cyclesBeforeLongBreak: boundedInteger(value?.cyclesBeforeLongBreak, DEFAULT_POMODORO_SETTINGS.cyclesBeforeLongBreak, 2, 12),
    autoStartNext: typeof value?.autoStartNext === "boolean"
      ? value.autoStartNext
      : DEFAULT_POMODORO_SETTINGS.autoStartNext,
  }
}

export function getPomodoroPhaseDurationMs(phase: PomodoroPhase, settings: PomodoroSettings): number {
  const minutes = phase === "focus"
    ? settings.focusMinutes
    : phase === "short_break"
      ? settings.shortBreakMinutes
      : settings.longBreakMinutes
  return minutes * 60_000
}

export function getNextPomodoroPhase(
  phase: PomodoroPhase,
  completedFocusCycles: number,
  cyclesBeforeLongBreak: number,
): Pick<ActivePomodoroState, "phase" | "completedFocusCycles"> {
  if (phase === "focus") {
    const completed = completedFocusCycles + 1
    return {
      phase: completed >= cyclesBeforeLongBreak ? "long_break" : "short_break",
      completedFocusCycles: completed,
    }
  }
  if (phase === "long_break") return { phase: "focus", completedFocusCycles: 0 }
  return { phase: "focus", completedFocusCycles }
}
