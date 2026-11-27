import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { useDayProgress } from "@/lib/nexora/day-progress"
import { isOpenTask } from "@/lib/nexora/logic"
import { cn } from "@/lib/cn"
import { TaskDialog } from "./task-dialog"
import { ReminderScheduler } from "./reminder-scheduler"
import { SegBar } from "./ui"
import {
  IconArrowRight,
  IconCalendar,
  IconChart,
  IconChevron,
  IconChevronUpDown,
  IconGoals,
  IconHabits,
  IconHome,
  IconJournal,
  IconKeyboard,
  IconMore,
  IconPanel,
  IconPlus,
  IconProjects,
  IconSearch,
  IconSettings,
  IconTasks,
  IconTimer,
} from "./icons"

type Icon = ComponentType<SVGProps<SVGSVGElement>>

type NavItem = {
  to: "/" | "/tasks" | "/calendar" | "/projects" | "/habits" | "/goals" | "/journal" | "/timer" | "/analytics" | "/settings"
  label: string
  icon: Icon
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Меню",
    items: [
      { to: "/", label: "Главная", icon: IconHome },
      { to: "/tasks", label: "Задачи", icon: IconTasks },
      { to: "/calendar", label: "Календарь", icon: IconCalendar },
      { to: "/projects", label: "Проекты", icon: IconProjects },
    ],
  },
  {
    label: "Ритм",
    items: [
      { to: "/habits", label: "Привычки", icon: IconHabits },
      { to: "/goals", label: "Цели", icon: IconGoals },
      { to: "/journal", label: "Дневник", icon: IconJournal },
      { to: "/timer", label: "Таймер", icon: IconTimer },
    ],
  },
  {
    label: "Обзор",
    items: [
      { to: "/analytics", label: "Аналитика", icon: IconChart },
      { to: "/settings", label: "Настройки", icon: IconSettings },
    ],
  },
]

const ALL_ITEMS = GROUPS.flatMap((g) => g.items)
const MOBILE_MAIN: NavItem["to"][] = ["/", "/tasks", "/calendar", "/habits"]
const STORAGE_KEY = "nexora-sidebar-collapsed"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function isActivePath(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/"
  return pathname === to || pathname.startsWith(`${to}/`)
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "N"
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("")
}

/** Закрывает поповер по клику вне и по Escape. */
function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose, ref])
}

/* ------------------------------------------------------------------ */
/* Палитра команд (Ctrl/⌘ + K)                                         */
/* ------------------------------------------------------------------ */

type Command = { id: string; label: string; hint?: string; icon: Icon; run: () => void }

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const addTask = useNexora((s) => s.addTask)
  const setTaskId = useUI((s) => s.setTaskId)
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setIndex(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const q = query.trim()
    const list: Command[] = []
    if (q) {
      list.push({
        id: "create",
        label: `Создать задачу «${q}»`,
        hint: "Входящие",
        icon: IconPlus,
        run: () => {
          const id = addTask({ title: q, status: "inbox", priority: "none" })
          void navigate({ to: "/tasks" })
          setTaskId(id)
        },
      })
    }
    for (const item of ALL_ITEMS) {
      list.push({
        id: item.to,
        label: item.label,
        hint: "Перейти",
        icon: item.icon,
        run: () => void navigate({ to: item.to }),
      })
    }
    const needle = q.toLowerCase()
    return needle ? list.filter((c) => c.id === "create" || c.label.toLowerCase().includes(needle)) : list
  }, [query, addTask, navigate, setTaskId])

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, commands.length - 1)))
  }, [commands.length])

  if (!open) return null

  const run = (cmd: Command | undefined) => {
    if (!cmd) return
    onClose()
    cmd.run()
  }

  return (
    <div className="animate-fade fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[14vh]" role="dialog" aria-modal="true" aria-label="Быстрые действия">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-panel animate-scale relative w-full max-w-[560px] overflow-hidden rounded-[1.5rem]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <IconSearch className="shrink-0 text-white/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setIndex((i) => (commands.length ? (i + 1) % commands.length : 0))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setIndex((i) => (commands.length ? (i - 1 + commands.length) % commands.length : 0))
              } else if (e.key === "Enter") {
                e.preventDefault()
                run(commands[index])
              } else if (e.key === "Escape") {
                onClose()
              }
            }}
            placeholder="Перейти или создать задачу…"
            className="w-full bg-transparent text-[15px] text-white outline-none focus-visible:outline-none placeholder:text-white/30"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul className="max-h-[340px] overflow-y-auto p-2">
          {commands.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Ничего не найдено</li>}
          {commands.map((cmd, i) => {
            const CmdIcon = cmd.icon
            return (
              <li key={cmd.id}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(cmd)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-200",
                    i === index ? "bg-white/[0.07] text-white" : "text-white/65",
                  )}
                >
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07]", i === index && "text-[var(--color-accent)]")}>
                    <CmdIcon />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="text-xs text-white/30">{cmd.hint}</span>}
                  {i === index && <IconArrowRight className="text-white/40" width={15} height={15} />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-white/[0.07] px-5 py-3 text-xs text-white/35">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> выбор</span>
          <span><span className="kbd">Enter</span> открыть</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Оболочка                                                            */
/* ------------------------------------------------------------------ */

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const settings = useNexora((s) => s.settings)
  const hydrated = useNexora((s) => s.hydrated)
  const loadSeed = useNexora((s) => s.loadSeed)
  const tasks = useNexora((s) => s.tasks)
  const projects = useNexora((s) => s.projects)
  const addTask = useNexora((s) => s.addTask)
  const setTaskId = useUI((s) => s.setTaskId)
  const { done, total, progress, todayOpen } = useDayProgress()

  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const profileRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  // Тема и акцентный цвет
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === "light") root.classList.remove("dark")
    else root.classList.add("dark")
    root.style.setProperty("--color-accent", settings.accent)
    root.style.setProperty("--color-accent-soft", `color-mix(in srgb, ${settings.accent} 14%, transparent)`)
    root.style.setProperty("--color-accent-glow", `color-mix(in srgb, ${settings.accent} 42%, transparent)`)
  }, [settings.theme, settings.accent])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        /* хранилище может быть недоступно — не критично */
      }
      return next
    })
    setProfileOpen(false)
  }, [])

  // Ctrl/⌘ + K — палитра команд
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const closeProfile = useCallback(() => setProfileOpen(false), [])
  const closeMore = useCallback(() => setMoreOpen(false), [])
  useDismiss(profileOpen, closeProfile, profileRef)
  useDismiss(moreOpen, closeMore, moreRef)

  useEffect(() => {
    setMoreOpen(false)
    setProfileOpen(false)
  }, [pathname])

  const activeTo = ALL_ITEMS.find((i) => isActivePath(pathname, i.to))?.to

  // Скользящий индикатор активного пункта
  const measure = useCallback(() => {
    const nav = navRef.current
    const el = activeTo ? itemRefs.current[activeTo] : null
    if (!nav || !el) {
      setIndicator((prev) => (prev === null ? prev : null))
      return
    }
    const navRect = nav.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const next = { top: Math.round(rect.top - navRect.top + nav.scrollTop), height: Math.round(rect.height) }
    setIndicator((prev) => (prev && prev.top === next.top && prev.height === next.height ? prev : next))
  }, [activeTo])

  useLayoutEffect(() => {
    measure()
  }, [measure, collapsed, projectsOpen, hydrated])

  useEffect(() => {
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(nav)
    return () => ro.disconnect()
  }, [measure, hydrated])

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active" && !p.archived)
        .slice(0, 4)
        .map((p) => ({
          id: p.id,
          title: p.title,
          open: tasks.filter((t) => (t.projectId === p.id || t.projectIds?.includes(p.id)) && isOpenTask(t)).length,
        })),
    [projects, tasks],
  )

  const createQuickTask = () => {
    const id = addTask({ title: "Новая задача", status: "inbox", priority: "none" })
    void navigate({ to: "/tasks" })
    setTaskId(id)
    setProfileOpen(false)
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">
        <div className="halo-bg"><i /></div>
        <div className="halo-grain" />
        <div className="animate-in relative z-10 space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black shadow-[0_0_60px_var(--color-accent-glow)]">
            <span className="block h-4 w-4 rounded-full border-[3px] border-black" />
          </div>
          <div className="text-2xl font-medium tracking-tight">Nexora</div>
          <p className="text-sm text-muted">Загрузка…</p>
          <button
            type="button"
            className="pressable rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-sm hover:bg-white/10"
            onClick={() => loadSeed()}
          >
            Загрузить демо-данные
          </button>
        </div>
      </div>
    )
  }

  const displayName = settings.displayName.trim()
  const badgeFor = (to: NavItem["to"]) => (to === "/tasks" && todayOpen > 0 ? todayOpen : 0)

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = activeTo === item.to
    const badge = badgeFor(item.to)
    const expandable = item.to === "/projects" && activeProjects.length > 0

    return (
      <li key={item.to}>
        <div className="relative flex items-center">
          <Link
            to={item.to}
            ref={(el) => {
              itemRefs.current[item.to] = el
            }}
            data-tip={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "tip pressable group relative flex min-w-0 flex-1 items-center rounded-xl py-[3px] pl-[3px] pr-2 text-[13.5px] outline-none",
              active ? "text-white" : "text-white/55 hover:text-white",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110",
                active && "text-[var(--color-accent)]",
              )}
            >
              <Icon />
            </span>
            <span
              className={cn(
                "ml-2 min-w-0 flex-1 truncate whitespace-nowrap transition-[opacity,transform] duration-300 ease-[var(--ease-drawer)]",
                collapsed ? "-translate-x-2 opacity-0" : "translate-x-0 opacity-100",
              )}
            >
              {item.label}
            </span>
            {badge > 0 && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-white/70 transition-opacity duration-300",
                  collapsed && "absolute right-1 top-1 opacity-100",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent-glow)]" />
                <span className={cn(collapsed && "hidden")}>{badge}</span>
              </span>
            )}
          </Link>
          {expandable && !collapsed && (
            <button
              type="button"
              aria-label={projectsOpen ? "Свернуть проекты" : "Развернуть проекты"}
              aria-expanded={projectsOpen}
              onClick={() => setProjectsOpen((v) => !v)}
              className="pressable absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white"
            >
              <IconChevron
                width={15}
                height={15}
                className={cn("transition-transform duration-500 ease-[var(--ease-drawer)]", projectsOpen && "rotate-180")}
              />
            </button>
          )}
        </div>

        {expandable && (
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-drawer)]",
              projectsOpen && !collapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <ul className="ml-[22px] min-h-0 overflow-hidden border-l border-white/[0.08] pl-3">
              {activeProjects.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/projects"
                    tabIndex={projectsOpen && !collapsed ? 0 : -1}
                    className="pressable flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-white/45 hover:bg-white/[0.04] hover:text-white"
                  >
                    <span className="truncate">{p.title}</span>
                    <span className="text-[11px] tabular-nums text-white/30">{p.open}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="flex h-full text-white">
      <div className="halo-bg"><i /></div>
      <div className="halo-grain" />
      <ReminderScheduler />

      {/* ------------------------- Сайдбар (desktop) ------------------------- */}
      <aside
        className={cn(
          "rail relative z-30 hidden shrink-0 p-3 transition-[width] duration-[560ms] ease-[var(--ease-drawer)] md:block",
          collapsed ? "is-collapsed w-[84px]" : "w-[284px]",
        )}
      >
        <div className="glass-panel flex h-full flex-col rounded-[1.75rem] p-3">
          {/* Шапка */}
          <div className="flex h-11 items-center">
            <button
              type="button"
              onClick={collapsed ? toggleCollapsed : undefined}
              aria-label={collapsed ? "Развернуть панель" : "Nexora"}
              data-tip="Развернуть"
              className={cn("tip pressable flex shrink-0 items-center", collapsed ? "cursor-pointer" : "cursor-default")}
            >
              <span className="ml-[3px] flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-b from-white to-white/75 shadow-[0_6px_20px_-6px_rgba(255,255,255,0.45)]">
                <span className="block h-3.5 w-3.5 rounded-full border-[2.5px] border-black/85" />
              </span>
            </button>
            <span
              className={cn(
                "ml-2.5 flex-1 truncate text-[15px] font-medium tracking-tight transition-[opacity,transform] duration-300 ease-[var(--ease-drawer)]",
                collapsed ? "pointer-events-none -translate-x-2 opacity-0" : "translate-x-0 opacity-100",
              )}
            >
              Nexora
            </span>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Свернуть панель"
              tabIndex={collapsed ? -1 : 0}
              className={cn(
                "pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/50 hover:bg-white/[0.06] hover:text-white",
                collapsed && "pointer-events-none absolute opacity-0",
              )}
            >
              <IconPanel width={16} height={16} />
            </button>
          </div>

          {/* Поиск */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            data-tip="Поиск  ⌘K"
            className="tip pressable mt-4 flex h-10 items-center rounded-xl border border-white/[0.08] bg-white/[0.03] pl-[11px] pr-2 text-sm text-white/35 hover:border-white/[0.16] hover:text-white/60"
          >
            <IconSearch width={16} height={16} className="shrink-0" />
            <span
              className={cn(
                "ml-3 flex-1 truncate text-left transition-opacity duration-300",
                collapsed ? "opacity-0" : "opacity-100",
              )}
            >
              Быстрый поиск
            </span>
            <span className={cn("kbd transition-opacity duration-300", collapsed ? "opacity-0" : "opacity-100")}>⌘K</span>
          </button>

          {/* Навигация */}
          <nav
            ref={navRef}
            aria-label="Основная навигация"
            className={cn("relative mt-3 min-h-0 flex-1 pr-0.5", collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}
          >
            {indicator && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 rounded-xl border border-white/[0.07] bg-white/[0.065] shadow-[0_0_30px_-10px_var(--color-accent-glow)] transition-[transform,height] duration-500 ease-[var(--ease-drawer)]"
                  style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[2px] top-0 w-[3px] rounded-full bg-[var(--color-accent)] shadow-[0_0_14px_var(--color-accent-glow)] transition-transform duration-500 ease-[var(--ease-drawer)]"
                  style={{ height: 20, transform: `translateY(${indicator.top + (indicator.height - 20) / 2}px)` }}
                />
              </>
            )}
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <p
                  className={cn(
                    "eyebrow px-2.5 pb-1.5 pt-3 transition-[opacity,height] duration-300",
                    collapsed ? "h-2 overflow-hidden pb-0 pt-0 opacity-0" : "opacity-100",
                  )}
                >
                  {group.label}
                </p>
                <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>
              </div>
            ))}
          </nav>

          {/* Прогресс дня */}
          <div
            className={cn(
              "overflow-hidden transition-[max-height,opacity,margin] duration-500 ease-[var(--ease-drawer)]",
              collapsed ? "mb-0 max-h-0 opacity-0" : "mb-3 max-h-24 opacity-100",
            )}
          >
            <div className="border-t border-white/[0.07] px-1 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow">Сегодня</span>
                <span className="text-[11px] tabular-nums text-white/55">
                  {done} / {total}
                </span>
              </div>
              <SegBar value={progress} segments={26} />
            </div>
          </div>

          {/* Профиль */}
          <div ref={profileRef} className="relative">
            {profileOpen && (
              <div
                className={cn(
                  "glass-panel animate-pop absolute z-50 w-[232px] rounded-2xl p-1.5",
                  collapsed ? "bottom-0 left-[calc(100%+20px)]" : "bottom-[calc(100%+8px)] left-0",
                )}
                role="menu"
              >
                <Link
                  to="/settings"
                  role="menuitem"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <IconSettings width={16} height={16} /> Настройки
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={createQuickTask}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <IconPlus width={16} height={16} /> Новая задача
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false)
                    setPaletteOpen(true)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <IconKeyboard width={16} height={16} /> Быстрые действия
                  <span className="kbd ml-auto">⌘K</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={toggleCollapsed}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <IconPanel width={16} height={16} /> {collapsed ? "Развернуть панель" : "Свернуть панель"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              data-tip={displayName || "Профиль"}
              className="tip pressable flex w-full items-center rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1.5 text-left hover:border-white/[0.15] hover:bg-white/[0.05]"
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-medium">
                {initials(displayName)}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b100e] bg-[var(--color-accent)]" />
              </span>
              <span
                className={cn(
                  "ml-2.5 min-w-0 flex-1 transition-opacity duration-300",
                  collapsed ? "w-0 opacity-0" : "opacity-100",
                )}
              >
                <span className="block truncate text-[13px] font-medium">{displayName || "Ваше имя"}</span>
                <span className="block truncate text-[11.5px] text-white/40">Личное пространство</span>
              </span>
              <IconChevronUpDown
                width={15}
                height={15}
                className={cn("mr-1.5 shrink-0 text-white/40 transition-opacity duration-300", collapsed && "hidden")}
              />
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------ Контент ------------------------------ */}
      <main className="relative z-10 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-28 md:pb-0">
        <div key={pathname} className="page-enter mx-auto w-full max-w-[1480px]">
          {children}
        </div>
      </main>

      {/* ------------------------- Нижняя навигация (mobile) ------------------------- */}
      <div ref={moreRef} className="fixed inset-x-3 bottom-3 z-40 md:hidden">
        {moreOpen && (
          <div className="glass-panel animate-pop mb-2 grid grid-cols-3 gap-1 rounded-3xl p-2" role="menu">
            {ALL_ITEMS.filter((i) => !MOBILE_MAIN.includes(i.to)).map((item) => {
              const Icon = item.icon
              const active = isActivePath(pathname, item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={cn(
                    "pressable flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[11.5px]",
                    active ? "bg-white/[0.08] text-[var(--color-accent)]" : "text-white/60 hover:bg-white/[0.05]",
                  )}
                >
                  <Icon />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
        <nav className="glass-panel flex items-stretch justify-around rounded-[1.6rem] p-1.5" aria-label="Навигация">
          {ALL_ITEMS.filter((i) => MOBILE_MAIN.includes(i.to)).map((item) => {
            const Icon = item.icon
            const active = isActivePath(pathname, item.to)
            const badge = badgeFor(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10.5px]",
                  active ? "bg-white/[0.08] text-[var(--color-accent)]" : "text-white/50",
                )}
              >
                <Icon />
                <span className="truncate">{item.label}</span>
                {badge > 0 && (
                  <span className="absolute right-[26%] top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent-glow)]" />
                )}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={cn(
              "pressable flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10.5px]",
              moreOpen ? "bg-white/[0.08] text-white" : "text-white/50",
            )}
          >
            <IconMore />
            <span>Ещё</span>
          </button>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <TaskDialog />
    </div>
  )
}
