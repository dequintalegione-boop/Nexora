import { useEffect } from "react"
import { useNexora } from "@/lib/nexora/store"
import { getDueTaskReminders } from "@/lib/nexora/reminders"

/**
 * Local scheduler that runs while Nexora is open:
 * - due-date automation rules (task.due)
 * - browser notifications for task reminders (when permission granted)
 *
 * A closed browser cannot run this scheduler; reliable closed-app delivery
 * requires a push service and server-side subscription management.
 */
export function ReminderScheduler() {
  const notificationsEnabled = useNexora((state) => state.settings.notificationsEnabled)

  useEffect(() => {
    if (typeof window === "undefined") return

    const tick = () => {
      // Always evaluate due-date automations while the app is open
      try {
        useNexora.getState().runDueAutomations()
      } catch (error) {
        console.error("Nexora due automations failed:", error)
      }

      // Notifications are optional and require permission
      if (!notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") {
        return
      }

      const now = Date.now()
      const due = getDueTaskReminders(useNexora.getState().tasks, now)

      for (const item of due) {
        const currentTask = useNexora.getState().tasks.find((task) => task.id === item.task.id)
        const currentReminder = currentTask?.reminders?.find((reminder) => reminder.id === item.reminder.id)
        if (!currentTask || !currentReminder || currentReminder.lastTriggeredAt) continue

        try {
          const notification = new Notification(currentTask.title, {
            body: currentTask.description?.trim() || "Время заняться задачей",
            tag: `nexora-reminder-${currentTask.id}-${currentReminder.id}`,
          })
          notification.onclick = () => {
            window.focus()
            notification.close()
          }

          const triggeredAt = new Date(now).toISOString()
          useNexora.getState().updateTask(currentTask.id, {
            reminders: currentTask.reminders?.map((reminder) =>
              reminder.id === currentReminder.id
                ? { ...reminder, lastTriggeredAt: triggeredAt }
                : reminder,
            ),
          })
        } catch (error) {
          console.error("Не удалось показать напоминание Nexora:", error)
        }
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 15_000)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [notificationsEnabled])

  return null
}
