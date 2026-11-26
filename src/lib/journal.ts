import { db } from '@/db'
import { createId, nowISO } from '@/lib/id'
import type { DailyEntry } from '@/types'

export function todayISODate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return now.getFullYear() + '-' + month + '-' + day
}

export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function getOrCreateEntry(date: string): Promise<DailyEntry> {
  const existing = await db.dailyEntries.where('date').equals(date).first()
  if (existing) return existing

  const now = nowISO()
  const entry: DailyEntry = {
    id: createId(),
    date,
    createdAt: now,
    updatedAt: now,
  }
  await db.dailyEntries.add(entry)
  return entry
}

export async function saveEntry(
  id: string,
  patch: Partial<Omit<DailyEntry, 'id' | 'createdAt' | 'date'>>
): Promise<void> {
  await db.dailyEntries.update(id, {
    ...patch,
    updatedAt: nowISO(),
  })
}
