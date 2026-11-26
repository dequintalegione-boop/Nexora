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

export interface Task {
  id: ID
  createdAt: string
  updatedAt: string
  archived?: boolean
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  dueDate?: string
  scheduledDate?: string
  projectId?: string
  directionId?: string
  parentId?: string
  dependsOn?: ID[]
  estimatedMinutes?: number
  actualMinutes?: number
  notes?: string
  repeat?: Repeat
  repeatOf?: ID
  history?: HistoryNote[]
  tags?: string[]
}

export interface Direction {
  id: ID
  createdAt: string
  updatedAt: string
  archived?: boolean
  title: string
  description?: string
  color: DirectionColor
  order: number
}

export interface Project {
  id: ID
  createdAt: string
  updatedAt: string
  archived?: boolean
  title: string
  description?: string
  directionId?: string
  status: ProjectStatus
  priority: Priority
  startDate?: string
  dueDate?: string
  notes?: string
  progress?: number
}

export interface Habit {
  id: ID
  createdAt: string
  updatedAt: string
  archived?: boolean
  title: string
  icon?: string
  measurementType: Measurement
  unit?: string
  targetValue?: number
  schedule: { days: number[]; time?: string }
  active: boolean
  startDate?: string
  endDate?: string
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
  gratitude?: string
  wins?: string
  best?: string
  challenges?: string
}

export interface DailyEntry {
  id: ID
  createdAt: string
  updatedAt: string
  date: string
  mood?: number
  energy?: number
  focus?: string
  freeThoughts?: string
  reflection?: Reflection
  tomorrowFocus?: string
}

export interface Goal {
  id: ID
  createdAt: string
  updatedAt: string
  archived?: boolean
  title: string
  description?: string
  horizon: Horizon
  status: GoalStatus
  targetDate?: string
  progress: number
  projectIds?: ID[]
  notes?: string
}

export interface TimeSession {
  id: ID
  createdAt: string
  updatedAt: string
  kind: SessionKind
  startedAt: string
  endedAt?: string
  taskId?: string
  title?: string
  durationMinutes?: number
}

export interface ActiveTimer {
  kind: SessionKind
  /** Start of the current running segment. Reset when a paused timer resumes. */
  startedAt: string
  /** Original start time of the whole session, preserved across pauses. */
  sessionStartedAt?: string
  taskId?: string
  label?: string
  pausedAt?: string
  accumulatedMs?: number
}

export interface Settings {
  initialized: boolean
  theme: ThemeMode
  accent: string
  displayName: string
  weekStartsOn: 0 | 1
  widgetOrder: string[]
  hiddenWidgets: string[]
}

export interface Persisted {
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
}
