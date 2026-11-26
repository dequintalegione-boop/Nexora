import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Target,
  Calendar,
  BookOpen,
  Repeat,
  Timer,
  Settings,
  Menu,
  X,
  Search,
  Bell,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Задачи', icon: CheckSquare },
  { to: '/projects', label: 'Проекты', icon: FolderKanban },
  { to: '/goals', label: 'Цели', icon: Target },
  { to: '/journal', label: 'Ежедневник', icon: BookOpen },
  { to: '/habits', label: 'Привычки', icon: Repeat },
  { to: '/calendar', label: 'Календарь', icon: Calendar },
  { to: '/timer', label: 'Таймер', icon: Timer },
]

export function Layout() {
  const { sidebarOpen, toggleSidebar } = useUIStore()

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[272px] flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="glass-panel m-3 flex h-[calc(100%-1.5rem)] flex-col rounded-[1.75rem]">
          <div className="flex h-[68px] items-center justify-between px-5">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[var(--color-accent)]/20 blur-md" />
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]/25">
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_14px_var(--color-accent)]" />
                </div>
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
                Nexora
              </span>
            </div>
            <button
              onClick={toggleSidebar}
              className="pressable rounded-xl p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text)] lg:hidden"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-4 pb-3">
            <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-[var(--color-text-dim)] transition-colors duration-300 hover:bg-white/[0.06] hover:border-[var(--color-border-strong)]">
              <Search size={15} strokeWidth={1.75} />
              <span>Поиск</span>
              <kbd className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-dim)]">
                ⌘K
              </kbd>
            </div>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-dim)]">
              Меню
            </p>
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'group pressable flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] font-medium',
                    isActive
                      ? 'nav-active'
                      : 'text-[var(--color-text-muted)] hover:bg-white/[0.045] hover:text-[var(--color-text)]'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      strokeWidth={1.75}
                      className={cn(
                        'transition-colors duration-300',
                        isActive
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-text-dim)] group-hover:text-[var(--color-text-muted)]'
                      )}
                    />
                    {label}
                  </>
                )}
              </NavLink>
            ))}

            <div className="my-3.5 mx-2 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'group pressable flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] font-medium',
                  isActive
                    ? 'nav-active'
                    : 'text-[var(--color-text-muted)] hover:bg-white/[0.045] hover:text-[var(--color-text)]'
                )
              }
            >
              <Settings
                size={18}
                strokeWidth={1.75}
                className="text-[var(--color-text-dim)]"
              />
              Настройки
            </NavLink>
          </nav>

          <div className="border-t border-white/[0.06] p-4">
            <div className="pressable flex items-center gap-3 rounded-2xl p-1.5 -m-1.5 hover:bg-white/[0.04]">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)]/25 to-cyan-500/15 text-[12px] font-semibold text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
                N
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg-elevated)] bg-[#30d158]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--color-text)]">
                  Пользователь
                </p>
                <p className="truncate text-[11px] text-[var(--color-text-dim)]">
                  Локальный профиль
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-md transition-opacity duration-400 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-3 px-4 lg:px-7">
          <button
            onClick={toggleSidebar}
            className="pressable rounded-xl p-2 text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)] lg:hidden"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>

          <div className="flex-1" />

          <button className="pressable relative rounded-xl p-2 text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]">
            <Bell size={18} strokeWidth={1.75} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-8 lg:px-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
