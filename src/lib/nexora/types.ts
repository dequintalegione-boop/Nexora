import type { TaskAutomationRule, TaskAutomationRun } from "./automations"

export type ID = string

/** Built-in status keys kept for backward compatibility. */
export type BuiltinTaskStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "waiting"
  | "done"
  | "cancelled"

/** Task status id: built-in key or custom id (e.g. custom_review). */
export type TaskStatus = BuiltinTaskStatus | (string & {})

export type BuiltinPriority = "none" | "low" | "medium" | "high" | "critical"

/** Priority id: built-in key or custom id. */
export type Priority = BuiltinPriority | (string & {})

/** User-configurable status definition. */
export interface StatusDefinition {
  id: string
  label: string
  /** Semantic role: open work, completed, or cancelled. */
  category: "open" | "done" | "cancelled"
  order: number
  /** Hidden statuses stay on existing tasks but are not offered in pickers. */
  hidden?: boolean
  /** True for the six default statuses shipped with Nexora. */
  builtin?: boolean
}

/** User-configurable priority definition. */
export interface PriorityDefinition {
  id: string
  label: string
  order: number
  hidden?: boolean
  builtin?: boolean
}
export type Repeat = "daily" | "weekly"
export type Horizon = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "long_term"
export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled"
export type GoalStatus = "active" | "completed" | "abandoned"
export type ThemeMode = "light" | "dark" | "system"
export type Measurement = "boolean" | "number" | "duration"
export type DirectionColor = "accent" | "ok" | "warn"
export type SessionKind = "free" | "focus" | "break"

export type PomodoroPhase = "focus" | "short_break" | "long_break"

export interface PomodoroSettings {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
  autoStartNext: boolean
}

export interface ActivePomodoroState {
  phase: PomodoroPhase
  completedFocusCycles: number
  phaseDurationMs: number
  cyclesBeforeLongBreak: number
  autoStartNext: boolean
}

export interface HistoryNote {
  at: string
  change: string
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly"

export interface RecurrenceByDay {
  /** Sunday = 0, Monday = 1, ... Saturday = 6. */
  weekday: number
  /** RFC 5545 ordinal: 1..5 or -1..-5 (last). */
  ordinal?: number
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number
  /** Legacy weekly selector retained for existing Nexora profiles. */
  weekdays?: number[]
  /** RFC 5545 BYDAY selectors, including ordinal weekdays for monthly/yearly rules. */
  byDay?: RecurrenceByDay[]
  /** RFC 5545 BYMONTHDAY values; negative values count backward from month end. */
  byMonthDay?: number[]
  /** RFC 5545 BYMONTH values (1..12). */
  byMonth?: number[]
  /** RFC 5545 WKST; Sunday = 0, Monday = 1, ... Saturday = 6. */
  weekStart?: number
  /** RFC 5545 EXDATE values, stored as date-only YYYY-MM-DD strings. */
  excludeDates?: string[]
  count?: number
  until?: string
}

export interface TaskReminder {
  id: ID
  minutesBefore?: number
  at?: string
  enabled: boolean
  anchor?: "start" | "due"
  lastTriggeredAt?: string
}

export interface TaskLink {
  id: ID
  title: string
  url: string
}

export interface Task {
  id: ID
  createdAt: string
  updatedAt: string
  archived?: boolean
  archivedAt?: string
  deletedAt?: string
  completedAt?: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  dueDate?: string
  scheduledDate?: string
  startAt?: string
  endAt?: string
  allDay?: boolean
  timezone?: string
  projectId?: string
  projectIds?: ID[]
  directionId?: string
  parentId?: ID
  dependsOn?: ID[]
  estimatedMinutes?: number
  estimateMinutes?: number
  actualMinutes?: number
  notes?: string
  repeat?: Repeat
  recurrenceRule?: RecurrenceRule
  recurrenceParentId?: ID
  /** True when a user explicitly detached this occurrence for one-off edits. */
  recurrenceOverride?: boolean
  occurrenceDate?: string
  occurrenceNumber?: number
  recurrenceStartDate?: string
  recurrenceStartScheduledDate?: string
  recurrenceStartDueDate?: string
  /** Original time-block anchors for generated occurrences; keeps wall-clock time stable across a series. */
  recurrenceStartStartAt?: string
  recurrenceStartEndAt?: string
  skippedOccurrences?: string[]
  tags?: string[]
  contexts?: string[]
  reminders?: TaskReminder[]
  links?: TaskLink[]
  history?: HistoryNote[]
}

export interface Direction {
  id: ID
  createdAt: string
  updatedAt: string
  title: string
  color: DirectionColor
  order: number
  description?: string
}

export interface Project {
  id: ID
  createdAt: string
  updatedAt: string
  title: string
  description?: string
  status: ProjectStatus
  priority: Priority
  directionId?: string
  dueDate?: string
  progress?: number
  archived?: boolean
  tags?: string[]
}

export interface Habit {
  id: ID
  createdAt: string
  updatedAt: string
  title: string
  measurementType: Measurement
  unit?: string
  targetValue?: number
  schedule: { days: number[] }
  active: boolean
  icon?: string
  directionId?: string
  startDate?: string
  endDate?: string
  archived?: boolean
}

export interface HabitLog {
  id: ID
  createdAt: string
  updatedAt: string
  habitId: ID
  date: string
  value: number | boolean
  skipped?: boolean
  skipReason?: string
}

export interface Reflection {
  wentWell?: string
  improve?: string
  gratitude?: string
  wins?: string
}

export interface DailyEntry {
  id: ID
  createdAt: string
  updatedAt: string
  date: string
  mood?: number
  energy?: number
  notes?: string
  wins?: string
  lessons?: string
  freeThoughts?: string
  reflection?: Reflection
  focus?: string
}

export interface Goal {
  id: ID
  createdAt: string
  updatedAt: string
  title: string
  horizon: Horizon
  status: GoalStatus
  progress: number
  archived?: boolean
  description?: string
  targetDate?: string
  projectIds?: ID[]
  notes?: string
  directionId?: string
}

export interface TimeSession {
  id: ID
  createdAt: string
  updatedAt: string
  kind: SessionKind
  startedAt: string
  endedAt: string
  taskId?: ID
  title?: string
  durationMinutes: number
}

export interface ActiveTimer {
  /** Stable ID for the current timer phase; absent on legacy persisted timers. */
  timerId?: ID
  /** Stable ID shared by all phases of one Pomodoro sequence. */
  pomodoroId?: ID
  kind: SessionKind
  startedAt: string
  sessionStartedAt?: string
  taskId?: ID
  label?: string
  accumulatedMs?: number
  pausedAt?: string
  pomodoro?: ActivePomodoroState
}

export interface Settings {
  /** Legacy rename map; still applied when taskStatuses is absent. */
  taskStatusLabels?: Partial<Record<string, string>>
  taskPriorityLabels?: Partial<Record<string, string>>
  /** Full status catalog (built-in + custom). When set, drives pickers and Kanban. */
  taskStatuses?: StatusDefinition[]
  /** Full priority catalog (built-in + custom). */
  taskPriorities?: PriorityDefinition[]
  notificationsEnabled?: boolean
  pomodoro?: PomodoroSettings
  /** Calendar planner snap interval in minutes. */
  calendarSnapMinutes?: 15 | 30 | 60
  /** Calendar planner zoom in pixels per hour. */
  calendarPixelsPerHour?: number
  /** Whether the calendar planner fits its visible time range to the viewport. */
  calendarFitToWindow?: boolean
  initialized: boolean
  theme: ThemeMode
  accent: string
  displayName: string
  weekStartsOn: 0 | 1
  widgetOrder: string[]
  hiddenWidgets: string[]
}

export interface Persisted {
  /** Schema version of the persisted profile. Missing/undefined is treated as 0. */
  schemaVersion?: number
  directions: Direction[]
  projects: Project[]
  tasks: Task[]
  habits: Habit[]
  habitLogs: HabitLog[]
  entries: DailyEntry[]
  goals: Goal[]
  sessions: TimeSession[]
  activeTimer: ActiveTimer | null
  settings: Settings
  automationRules?: TaskAutomationRule[]
  automationRuns?: TaskAutomationRun[]
}
