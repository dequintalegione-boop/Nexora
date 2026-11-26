import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { formatDate } from '@/lib/utils'
import {
  CheckSquare,
  FolderKanban,
  Target,
  BookOpen,
  TrendingUp,
  Zap,
  Clock,
  ArrowUpRight,
} from 'lucide-react'

export function Dashboard() {
  const tasksCount = useLiveQuery(() =>
    db.tasks.where('status').anyOf(['inbox', 'planned', 'in_progress']).count()
  )
  const projectsCount = useLiveQuery(() =>
    db.projects.where('status').equals('active').count()
  )
  const goalsCount = useLiveQuery(() =>
    db.goals.where('status').equals('active').count()
  )
  const today = new Date().toISOString().slice(0, 10)
  const todayEntry = useLiveQuery(() =>
    db.dailyEntries.where('date').equals(today).first()
  )

  const stats = [
    {
      label: 'Активные задачи',
      value: tasksCount ?? 0,
      icon: CheckSquare,
    },
    {
      label: 'Проекты',
      value: projectsCount ?? 0,
      icon: FolderKanban,
    },
    {
      label: 'Цели',
      value: goalsCount ?? 0,
      icon: Target,
    },
    {
      label: 'Ежедневник',
      value: todayEntry ? 'Заполнен' : 'Пусто',
      icon: BookOpen,
      isText: true,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="animate-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
              Overview
            </span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--color-text)]">
            Dashboard
          </h1>
          <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
            {formatDate(new Date().toISOString(), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="stagger grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="glass animate-in group relative overflow-hidden p-5"
          >
            <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[var(--color-accent)]/[0.06] blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-70" />

            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[13px] text-[var(--color-text-muted)]">
                  {stat.label}
                </p>
                <p className="mt-2.5 text-[26px] font-semibold tracking-tight tabular-nums leading-none">
                  {stat.isText ? (
                    <span className="text-[17px] font-medium">{stat.value}</span>
                  ) : (
                    stat.value
                  )}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)] transition-transform duration-400 group-hover:scale-105">
                <stat.icon size={17} strokeWidth={1.75} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-3.5 lg:grid-cols-3">
        {/* Welcome */}
        <div className="glass-static animate-in lg:col-span-2 p-6" style={{ animationDelay: '0.12s' }}>
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} strokeWidth={1.75} className="text-[var(--color-accent)]" />
              <h2 className="text-[15px] font-medium tracking-tight">Сегодня</h2>
            </div>
            <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent)]">
              Этап 1
            </span>
          </div>

          <p className="max-w-xl text-[14px] leading-relaxed text-[var(--color-text-muted)]">
            Добро пожаловать в Nexora. Основа готова: локальная база данных,
            навигация и дизайн-система. Следующие этапы добавят ежедневник,
            задачи, проекты и остальные модули.
          </p>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: Zap, label: 'Быстрые действия', desc: 'Скоро' },
              { icon: Clock, label: 'Фокус-сессия', desc: 'Скоро' },
              { icon: Target, label: 'Чем заняться?', desc: 'Скоро' },
            ].map((item) => (
              <button
                key={item.label}
                className="pressable flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/[0.03] px-4 py-3.5 text-left hover:border-[var(--color-border-strong)] hover:bg-white/[0.05]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <item.icon size={15} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{item.label}</p>
                  <p className="text-[11px] text-[var(--color-text-dim)]">
                    {item.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="glass-static animate-in p-6" style={{ animationDelay: '0.18s' }}>
          <div className="mb-5 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            <h2 className="text-[15px] font-medium tracking-tight">Активность</h2>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--color-text-muted)]">
                Прогресс дня
              </span>
              <span className="text-[13px] font-medium tabular-nums text-[var(--color-accent)]">
                0%
              </span>
            </div>

            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="progress-fill h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-cyan-300 shadow-[0_0_14px_var(--color-accent-glow)]"
                style={{ width: '0%' }}
              />
            </div>

            <div className="space-y-3">
              {[
                { label: 'Задачи выполнено', value: '0 / 0' },
                { label: 'Привычки', value: '0 / 0' },
                { label: 'Фокус-время', value: '0 мин' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span className="text-[var(--color-text-muted)]">
                    {row.label}
                  </span>
                  <span className="tabular-nums text-[var(--color-text)]">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <button className="pressable mt-1 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[var(--color-border)] bg-white/[0.03] py-2.5 text-[13px] font-medium text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]">
              Открыть ежедневник
              <ArrowUpRight size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* Footer card */}
      <div className="glass-static animate-in flex items-center gap-4 p-4" style={{ animationDelay: '0.24s' }}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)]">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">Система готова к развитию</p>
          <p className="text-[12.5px] text-[var(--color-text-muted)]">
            Данные хранятся локально. Экспорт и синхронизация появятся позже.
          </p>
        </div>
      </div>
    </div>
  )
}
