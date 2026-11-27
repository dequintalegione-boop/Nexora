import type { TaskAutomationRule, TaskAutomationRun } from "./automations"

export type ID = string

export type TaskStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "waiting"
  | "done"
  | "cancelled"

export type Priority = "none" | "low" | "medium" | "high" | "critical"
export type Repeat = "daily" | "weekly"
export type Horizon = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "long_term"
export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled"
export type GoalStatus = "active" | "completed" | "abandoned"
export type ThemeMode = "light" | "dark" | "system"
export type Measurement = "boolean" | "number" | "duration"
export type DirectionColor = "accent" | "ok" | "warn"
export type SessionKind = "free" | "focus" | "break"

export interface HistoryNote {
  at: string
  change: string
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly"

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: number[]
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
  occurrenceDate?: string
  skippedOccurrences?: string[]
  tags?: string[]
  contexts?: string[]
  reminders?: TaskReminder[]
  links?: TaskLink[]
  history?: HistoryNote[]
}

export interface Project {
  id: ID
  createdAt: string
  updatedAt: string
  title: string
  status: ProjectStatus
  priority: Priority
  directionId?: string
  description?: string
  archived?: boolean
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
}

export interface Goal {
  id: ID
  createdAt: string
  updatedAt: string
  title: string
  horizon: Horizon
  status: GoalStatus
  progress: number
  description?: string
  targetDate?: string
  projectIds?: ID[]
  notes?: string
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
  kind: SessionKind
  startedAt: string
  sessionStartedAt?: string
  taskId?: ID
  label?: string
  accumulatedMs?: number
  pausedAt?: string
}

export interface Settings {
  initialized: boolean
  theme: ThemeMode
  accent: string
  displayName: string
  weekStartsOn: 0 | 1
  widgetOrder: string[]
  hiddenWidgets: string[]
  notificationsEnabled: boolean
  taskStatusLabels?: Partial<Record<TaskStatus, string>>
  taskPriorityLabels?: Partial<Record<Priority, string>>
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
