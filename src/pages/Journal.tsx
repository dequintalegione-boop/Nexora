import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import {
  getOrCreateEntry,
  saveEntry,
  shiftDate,
  todayISODate,
} from '@/lib/journal'
import { cn, formatDate } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  Heart,
  Trophy,
  AlertCircle,
  Sunrise,
} from 'lucide-react'
import type { DailyEntry } from '@/types'

function ScorePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] text-[var(--color-text-muted)]">{label}</span>
        <span className="text-[13px] font-medium tabular-nums text-[var(--color-accent)]">
          {value ?? '—'}
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'pressable h-8 flex-1 rounded-lg text-[11px] font-medium transition-colors',
              value === n
                ? 'bg-[var(--color-accent)] text-[#04120f]'
                : 'bg-white/[0.04] text-[var(--color-text-dim)] hover:bg-white/[0.08]'
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
}: {
  icon: typeof BookOpen
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
        <Icon size={15} strokeWidth={1.75} className="text-[var(--color-accent)]" />
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white/[0.03] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)]/30 focus:bg-white/[0.05]"
      />
    </div>
  )
}

export function Journal() {
  const [date, setDate] = useState(todayISODate)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [mood, setMood] = useState<number | undefined>()
  const [energy, setEnergy] = useState<number | undefined>()
  const [freeThoughts, setFreeThoughts] = useState('')
  const [gratitude, setGratitude] = useState('')
  const [wins, setWins] = useState('')
  const [challenges, setChallenges] = useState('')
  const [tomorrowFocus, setTomorrowFocus] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const live = useLiveQuery(
    () => db.dailyEntries.where('date').equals(date).first(),
    [date]
  )

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    ;(async () => {
      const entry = await getOrCreateEntry(date)
      if (cancelled) return
      applyEntry(entry)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [date])

  useEffect(() => {
    if (live && live.id === entryId) {
      // keep local edits unless switched day
    }
  }, [live, entryId])

  function applyEntry(entry: DailyEntry) {
    setEntryId(entry.id)
    setMood(entry.mood)
    setEnergy(entry.energy)
    setFreeThoughts(entry.freeThoughts ?? '')
    setGratitude(entry.reflection?.gratitude ?? '')
    setWins(entry.reflection?.wins ?? '')
    setChallenges(entry.reflection?.challenges ?? '')
    setTomorrowFocus(entry.tomorrowFocus ?? '')
  }

  const persist = useCallback(
    async (patch: Parameters<typeof saveEntry>[1]) => {
      if (!entryId) return
      setSaving(true)
      try {
        await saveEntry(entryId, patch)
      } finally {
        setSaving(false)
      }
    },
    [entryId]
  )

  async function onMood(n: number) {
    setMood(n)
    await persist({ mood: n })
  }

  async function onEnergy(n: number) {
    setEnergy(n)
    await persist({ energy: n })
  }

  useEffect(() => {
    if (!loaded || !entryId) return
    const t = setTimeout(() => {
      void persist({
        freeThoughts: freeThoughts || undefined,
        tomorrowFocus: tomorrowFocus || undefined,
        reflection: {
          gratitude: gratitude || undefined,
          wins: wins || undefined,
          challenges: challenges || undefined,
        },
      })
    }, 500)
    return () => clearTimeout(t)
  }, [
    freeThoughts,
    gratitude,
    wins,
    challenges,
    tomorrowFocus,
    loaded,
    entryId,
    persist,
  ])

  const isToday = date === todayISODate()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="animate-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
              Ежедневник
            </span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight">Дневная запись</h1>
          <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
            {formatDate(date + 'T12:00:00', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {isToday && (
              <span className="ml-2 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
                Сегодня
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="pressable rounded-xl p-2 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]"
            aria-label="Предыдущий день"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setDate(todayISODate())}
            className="pressable rounded-xl px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            className="pressable rounded-xl p-2 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)]"
            aria-label="Следующий день"
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="glass-static animate-in space-y-5 p-5" style={{ animationDelay: '0.06s' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--color-accent)]" strokeWidth={1.75} />
            <h2 className="text-[15px] font-medium">Самочувствие</h2>
          </div>
          <span className="text-[11px] text-[var(--color-text-dim)]">
            {saving ? 'Сохранение…' : loaded ? 'Сохранено' : 'Загрузка…'}
          </span>
        </div>
        <ScorePicker label="Настроение" value={mood} onChange={onMood} />
        <ScorePicker label="Энергия" value={energy} onChange={onEnergy} />
      </div>

      <div className="glass-static animate-in space-y-5 p-5" style={{ animationDelay: '0.1s' }}>
        <Field
          icon={BookOpen}
          label="Свободные мысли"
          placeholder="Что сейчас на уме…"
          value={freeThoughts}
          onChange={setFreeThoughts}
          rows={4}
        />
      </div>

      <div className="glass-static animate-in space-y-5 p-5" style={{ animationDelay: '0.14s' }}>
        <h2 className="text-[15px] font-medium">Рефлексия</h2>
        <Field
          icon={Heart}
          label="Благодарность"
          placeholder="За что благодарен сегодня…"
          value={gratitude}
          onChange={setGratitude}
        />
        <Field
          icon={Trophy}
          label="Победы"
          placeholder="Что получилось хорошо…"
          value={wins}
          onChange={setWins}
        />
        <Field
          icon={AlertCircle}
          label="Сложности"
          placeholder="Что было трудно…"
          value={challenges}
          onChange={setChallenges}
        />
      </div>

      <div className="glass-static animate-in space-y-5 p-5" style={{ animationDelay: '0.18s' }}>
        <Field
          icon={Sunrise}
          label="Фокус на завтра"
          placeholder="Главное на завтрашний день…"
          value={tomorrowFocus}
          onChange={setTomorrowFocus}
          rows={2}
        />
      </div>
    </div>
  )
}
