import { useEffect } from "react"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "@/router"
import { db } from "@/db"
import { defaultSettings, useNexora } from "@/lib/nexora/store"
import type { Persisted } from "@/lib/nexora/types"

async function initializeApp() {
  const store = useNexora.getState()
  if (store.settings.initialized) return

  await db.open()
  const [tasks, projects, directions, habits, habitLogs, entries, goals, sessions, legacySettings] =
    await Promise.all([
      db.tasks.toArray(),
      db.projects.toArray(),
      db.directions.toArray(),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.dailyEntries.toArray(),
      db.goals.toArray(),
      db.timeSessions.toArray(),
      db.settings.get("settings"),
    ])

  const hasLegacyData = [
    tasks,
    projects,
    directions,
    habits,
    habitLogs,
    entries,
    goals,
    sessions,
  ].some((items) => items.length > 0)

  if (!hasLegacyData) {
    store.updateSettings({ initialized: true })
    return
  }

  const migrated: Persisted = {
    tasks: tasks.map((task) => ({ ...task })) as Persisted["tasks"],
    projects: projects.map((project) => ({ ...project })) as Persisted["projects"],
    directions: directions.map((direction) => ({
      ...direction,
      color:
        direction.color === "ok" || direction.color === "warn"
          ? direction.color
          : "accent",
      order: direction.order ?? 0,
    })) as Persisted["directions"],
    habits: habits.map((habit) => ({ ...habit })) as Persisted["habits"],
    habitLogs: habitLogs.map((log) => ({ ...log })) as Persisted["habitLogs"],
    entries: entries.map((entry) => ({ ...entry })) as Persisted["entries"],
    goals: goals.map((goal) => ({ ...goal, progress: goal.progress ?? 0 })) as Persisted["goals"],
    sessions: sessions.map((session) => ({
      ...session,
      kind: session.isPomodoro ? "focus" : "free",
    })) as Persisted["sessions"],
    activeTimer: null,
    settings: {
      ...defaultSettings(),
      initialized: true,
      theme: legacySettings?.theme ?? "dark",
      accent: legacySettings?.accentColor ?? "#2dd4bf",
      weekStartsOn: legacySettings?.weekStartsOn ?? 1,
    },
  }

  // Keep the original IndexedDB database untouched until the user verifies the migration.
  store.replaceAll(migrated)
}

export default function App() {
  const hydrated = useNexora((state) => state.hydrated)

  useEffect(() => {
    if (!hydrated) return

    initializeApp().catch((error) => {
      // Do not mark a failed migration as complete. The original IndexedDB data remains intact.
      console.error("Не удалось инициализировать Nexora. Миграция будет повторена при следующем запуске:", error)
    })
  }, [hydrated])

  return <RouterProvider router={router} />
}
