import { useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'

const titles: Record<string, string> = {
  '/tasks': 'Задачи',
  '/projects': 'Проекты',
  '/goals': 'Цели',
  '/journal': 'Ежедневник',
  '/calendar': 'Календарь',
  '/timer': 'Таймер',
  '/settings': 'Настройки',
}

export function Placeholder() {
  const { pathname } = useLocation()
  const title = titles[pathname] ?? 'Раздел'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="animate-in">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/50" />
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
            Модуль
          </span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="glass-static animate-in flex flex-col items-center justify-center gap-5 px-8 py-24 text-center" style={{ animationDelay: '0.08s' }}>
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Construction size={26} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-[16px] font-medium tracking-tight text-[var(--color-text)]">
            В разработке
          </p>
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--color-text-muted)]">
            Этот модуль появится на следующих этапах дорожной карты.
          </p>
        </div>
      </div>
    </div>
  )
}
