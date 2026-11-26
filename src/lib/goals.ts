import { db } from '@/db'
import { createId, nowISO } from '@/lib/id'
import type { Goal } from '@/types'

export type GoalHorizon = Goal['horizon']
export type GoalStatus = Goal['status']

export const HORIZON_LABELS: Record<GoalHorizon, string> = {
  daily: 'День',
  weekly: 'Неделя',
  monthly: 'Месяц',
  quarterly: 'Квартал',
  yearly: 'Год',
  long_term: 'Долгосрок',
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: 'Активна',
  completed: 'Достигнута',
  abandoned: 'Отменена',
}

export async function createGoal(input: {
  title: string
  horizon?: GoalHorizon
  description?: string
}): Promise<Goal> {
  const now = nowISO()
  const goal: Goal = {
    id: createId(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    horizon: input.horizon ?? 'monthly',
    status: 'active',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  }
  await db.goals.add(goal)
  return goal
}

export async function updateGoal(
  id: string,
  patch: Partial<Omit<Goal, 'id' | 'createdAt'>>
): Promise<void> {
  await db.goals.update(id, {
    ...patch,
    updatedAt: nowISO(),
  })
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
}
