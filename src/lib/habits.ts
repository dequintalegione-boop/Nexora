import { db } from '@/db'
import { createId, nowISO } from '@/lib/id'
import type { Habit, HabitLog } from '@/types'
import { todayISODate } from '@/lib/journal'

export async function createHabit(input: {
  title: string
  measurementType?: Habit['measurementType']
}): Promise<Habit> {
  const now = nowISO()
  const habit: Habit = {
    id: createId(),
    title: input.title.trim(),
    measurementType: input.measurementType ?? 'boolean',
    schedule: { days: [0, 1, 2, 3, 4, 5, 6] },
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  await db.habits.add(habit)
  return habit
}

export async function updateHabit(
  id: string,
  patch: Partial<Omit<Habit, 'id' | 'createdAt'>>
): Promise<void> {
  await db.habits.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteHabit(id: string): Promise<void> {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete()
    await db.habits.delete(id)
  })
}

export async function getLogForDate(
  habitId: string,
  date: string
): Promise<HabitLog | undefined> {
  return db.habitLogs.where('[habitId+date]').equals([habitId, date]).first()
}

export async function toggleHabitDone(
  habit: Habit,
  date = todayISODate()
): Promise<void> {
  const existing = await getLogForDate(habit.id, date)
  if (existing) {
    const done =
      typeof existing.value === 'boolean'
        ? existing.value
        : Number(existing.value) > 0
    if (done) {
      await db.habitLogs.delete(existing.id)
    } else {
      await db.habitLogs.update(existing.id, {
        value: true,
        updatedAt: nowISO(),
      })
    }
    return
  }
  const now = nowISO()
  const log: HabitLog = {
    id: createId(),
    habitId: habit.id,
    date,
    value: true,
    createdAt: now,
    updatedAt: now,
  }
  await db.habitLogs.add(log)
}

export async function streakForHabit(habitId: string): Promise<number> {
  const logs = await db.habitLogs
    .where('habitId')
    .equals(habitId)
    .toArray()
  const doneDates = new Set(
    logs
      .filter((l) =>
        typeof l.value === 'boolean' ? l.value : Number(l.value) > 0
      )
      .map((l) => l.date)
  )
  let streak = 0
  let cursor = todayISODate()
  for (let i = 0; i < 365; i++) {
    if (!doneDates.has(cursor)) {
      if (i === 0) {
        const d = new Date(cursor + 'T12:00:00')
        d.setDate(d.getDate() - 1)
        cursor = d.toISOString().slice(0, 10)
        continue
      }
      break
    }
    streak++
    const d = new Date(cursor + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    cursor = d.toISOString().slice(0, 10)
  }
  return streak
}
