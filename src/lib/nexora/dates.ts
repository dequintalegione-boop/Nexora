export function isoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

export function addDays(value: string, amount: number): string {
  const date = parseISODate(value)
  date.setDate(date.getDate() + amount)
  return isoDate(date)
}

export function weekday(value: string): number {
  return parseISODate(value).getDay()
}

export function startOfWeek(value: string, weekStartsOn: 0 | 1): string {
  const date = parseISODate(value)
  const diff = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - diff)
  return isoDate(date)
}

export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1): (string | null)[] {
  const first = new Date(year, month, 1)
  const pad = (first.getDay() - weekStartsOn + 7) % 7
  const count = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let day = 1; day <= count; day++) cells.push(isoDate(new Date(year, month, day)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function noonISO(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString()
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return "Доброй ночи"
  if (hour < 12) return "Доброе утро"
  if (hour < 18) return "Добрый день"
  return "Добрый вечер"
}
