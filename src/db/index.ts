import Dexie, { type Table } from 'dexie'
import type {
  Task,
  Project,
  Direction,
  Habit,
  HabitLog,
  DailyEntry,
  Goal,
  TimeSession,
  AppSettings,
} from '@/types'

export class NexoraDB extends Dexie {
  tasks!: Table<Task, string>
  projects!: Table<Project, string>
  directions!: Table<Direction, string>
  habits!: Table<Habit, string>
  habitLogs!: Table<HabitLog, string>
  dailyEntries!: Table<DailyEntry, string>
  goals!: Table<Goal, string>
  timeSessions!: Table<TimeSession, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('nexora')

    this.version(1).stores({
      tasks: 'id, status, priority, projectId, directionId, dueDate, scheduledDate, parentId, archived, updatedAt',
      projects: 'id, directionId, status, priority, dueDate, archived, updatedAt',
      directions: 'id, order, archived',
      habits: 'id, active, archived',
      habitLogs: 'id, habitId, date, [habitId+date]',
      dailyEntries: 'id, date',
      goals: 'id, horizon, status, targetDate, archived',
      timeSessions: 'id, taskId, projectId, directionId, startedAt, endedAt',
      settings: 'id',
    })
  }
}

export const db = new NexoraDB()

/** Ensure default settings exist */
export async function ensureDefaults() {
  const existing = await db.settings.get('settings')
  if (!existing) {
    await db.settings.put({
      id: 'settings',
      theme: 'dark',
      accentColor: '#38bdf8',
      language: 'ru',
      weekStartsOn: 1,
    })
  }
}
