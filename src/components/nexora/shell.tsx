import { Link, useRouterState } from "@tanstack/react-router"
import { type ReactNode } from "react"
import { useNexora } from "@/lib/nexora/store"
import { TaskDialog } from "./task-dialog"
import { cn } from "@/lib/cn"

const NAV = [
  { to: "/", label: "Главная", icon: "⌂" },
  { to: "/tasks", label: "Задачи", icon: "☑" },
  { to: "/habits", label: "Привычки", icon: "↻" },
  { to: "/projects", label: "Проекты", icon: "◫" },
  { to: "/goals", label: "Цели", icon: "◎" },
  { to: "/journal", label: "Дневник", icon: "✎" },
  { to: "/calendar", label: "Календарь", icon: "▦" },
  { to: "/timer", label: "Таймер", icon: "⏱" },
  { to: "/settings", label: "Настройки", icon: "⚙" },
]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const settings = useNexora((s) => s.settings)
  const hydrated = useNexora((s) => s.hydrated)
  const loadSeed = useNexora((s) => s.loadSeed)

  // Apply theme
  if (typeof document !== "undefined") {
    const root = document.documentElement
    if (settings.theme === "light") root.classList.remove("dark")
    else root.classList.add("dark")
    root.style.setProperty("--color-accent", settings.accent)
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f12] text-white">
        <div className="text-center space-y-4">
          <div className="text-2xl font-semibold">Nexora</div>
          <p className="text-white/60">Загрузка...</p>
          <button
            className="px-4 py-2 rounded-lg bg-teal-500 text-black font-medium"
            onClick={() => loadSeed()}
          >
            Загрузить демо-данные
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f12] text-white flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-white/10 p-4 gap-1">
        <div className="text-lg font-semibold px-2 mb-4">Nexora</div>
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              pathname === item.to ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
            )}
          >
            <span className="w-5 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">{children}</main>

      {/* Mobile nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-white/10 bg-[#0f0f12]/90 backdrop-blur flex justify-around py-2 z-40">
        {NAV.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center text-xs gap-0.5 px-2",
              pathname === item.to ? "text-teal-400" : "text-white/50"
            )}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <TaskDialog />
    </div>
  )
}
