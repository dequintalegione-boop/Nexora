import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { createId, nowISO } from '@/lib/id'
import { Clock, Play, Square, History } from 'lucide-react'

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return h + ':' + m + ':' + s
}

export function Timer() {
  const sessions = useLiveQuery(() => db.timeSessions.orderBy('startedAt').reverse().limit(20).toArray(), [])
  const active = useMemo(() => sessions?.find((session) => !session.endedAt), [sessions])
  const [now, setNow] = useState(Date.now())
  const [title, setTitle] = useState('Фокус-сессия')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = active ? Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000)) : 0

  async function start() {
    if (busy || active) return
    setBusy(true)
    try {
      const stamp = nowISO()
      await db.timeSessions.add({
        id: createId(),
        title: title.trim() || 'Фокус-сессия',
        startedAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      })
    } finally { setBusy(false) }
  }

  async function stop() {
    if (!active || busy) return
    setBusy(true)
    try {
      const endedAt = nowISO()
      const durationMinutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(active.startedAt).getTime()) / 60000))
      await db.timeSessions.update(active.id, { endedAt, durationMinutes, updatedAt: endedAt })
    } finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="animate-in"><div className="mb-1.5 flex items-center gap-2"><Clock size={14} className="text-[var(--color-accent)]"/><span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">Время</span></div><h1 className="text-[28px] font-semibold">Таймер фокуса</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">Запускай рабочие сессии и сохраняй фактическое время.</p></div>
    <section className="glass-static flex flex-col items-center gap-6 p-8">
      <input value={active?.title ?? title} onChange={(e) => setTitle(e.target.value)} disabled={!!active} aria-label="Название сессии" className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-white/[0.04] px-4 py-2 text-center text-sm outline-none disabled:opacity-70"/>
      <div className="font-mono text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl">{formatDuration(elapsed)}</div>
      <p className="text-sm text-[var(--color-text-muted)]">{active ? 'Сессия идёт — время сохраняется автоматически' : 'Готов к новой сессии'}</p>
      {active ? <button onClick={stop} disabled={busy} className="pressable flex items-center gap-2 rounded-xl bg-red-500 px-6 py-3 text-sm font-medium text-white disabled:opacity-50"><Square size={16}/>Завершить</button> : <button onClick={start} disabled={busy} className="pressable flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[#04120f] disabled:opacity-50"><Play size={16}/>Начать фокус</button>}
    </section>
    <section className="glass-static p-5"><div className="mb-4 flex items-center gap-2"><History size={16} className="text-[var(--color-accent)]"/><h2 className="text-sm font-medium">Последние сессии</h2></div>
      {!sessions?.filter(s => s.endedAt).length ? <p className="text-sm text-[var(--color-text-muted)]">Завершённых сессий пока нет.</p> : <div className="space-y-3">{sessions.filter(s => s.endedAt).map(s => <div key={s.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-0"><div><p className="text-sm font-medium">{s.title || 'Фокус-сессия'}</p><p className="text-xs text-[var(--color-text-dim)]">{new Date(s.startedAt).toLocaleString('ru-RU')}</p></div><span className="text-sm tabular-nums text-[var(--color-accent)]">{s.durationMinutes ?? 0} мин</span></div>)}</div>}
    </section>
  </div>
}
