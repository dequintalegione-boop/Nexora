/** Core domain types for Nexora */

export type ID = string

export type TaskStatus =
  | 'inbox'
  | 'planned'
  | 'in_progress'
  | 'waiting'
  | 'done'
  | 'cancelled'

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface BaseEntity {
  id: ID
  createdAt: string // ISO
  updatedAt: string // ISO
  archived?: boolean
}

export interface Task extends BaseEntity {
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  dueDate?: string // ISO date
  scheduledDate?: string
  startDate?: string
  projectRule?: string
  directionId?: ID
  projectId?: ID
  parentId?: ID
  dependsOn?: ID[]
  estimatedMinutes?: number
  actualMinutes?: number
  tags?: string[]
  notes?: string
}

export interface Project extends BaseEntity {
  title: string
  description?: string
  directionId?: ID
  status: 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: Priority
  startDate?: string
  dueDate?: string
  progress?: number // 0-100, optional override
  notes?: string
}

export interface Direction extends BaseEntity {
  title: string
  description?: string
  color?: string
  order?: number
}

export interface Habit extends BaseEntity {
  title: string
  icon?: string
  measurementType: 'boolean' | 'number' | 'duration'
  unit?: string
  targetValue?: number
  schedule: {
    days: number[] // 0=Sun .. 6=Sat
    time?: string // HH:mm
  }
  active: boolean
  startDate?: string
  endDate?: string
}

export interface HabitLog extends BaseEntity {
  habitId: ID
  date: string // YYYY-MM-DD
  value: number | boolean
  note?: string
  skipped?: boolean
  skipReason?: string
}

export interface DailyEntry extends BaseEntity {
  date: string // YYYY-MM-DD
  mood?: number
  energy?: number
  customMetrics?: Record<string, number>
  freeThoughts?: string
  reflection?: {
    gratitude?: string
    wins?: string
    challenges?: string
  }
  tomorrowFocus?: string
}

export interface Goal extends BaseEntity {
  title: string
  description?: string
  horizon: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'long_term'
  status: 'active' | 'completed' | 'abandoned'
  targetDate?: string
  progress?: number
  projectIds?: ID[]
  notes?: string
}

export interface TimeSession extends BaseEntity {
  title?: string
  taskId?: ID
  projectId?: ID
  directionId?: ID
  startedAt: string
  endedAt?: string
  durationMinutes?: number
  isPomodoro?: boolean
  notes?: string
}

export interface AppSettings {
  id: 'settings'
  theme: 'light' | 'dark' | 'system'
  accentColor: string
  language: string
  weekStartsOn: 0 | 1
  dashboardLayouts?: Record<string, unknown>
}
