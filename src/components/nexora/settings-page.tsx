import { useNexora } from "@/lib/nexora/store"
import type { ThemeMode, TaskStatus, Priority } from "@/lib/nexora/types"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import { Button, Card, Input, Select } from "./ui"

export function SettingsPage() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const loadSeed = useNexora((s) => s.loadSeed)
  const replaceAll = useNexora((s) => s.replaceAll)

  const exportBackup = () => {
    const data = useNexora.getState()
    const backup = {
      schema: 1,
      exportedAt: new Date().toISOString(),
      directions: data.directions,
      projects: data.projects,
      tasks: data.tasks,
      habits: data.habits,
      habitLogs: data.habitLogs,
      entries: data.entries,
      goals: data.goals,
      sessions: data.sessions,
      activeTimer: data.activeTimer,
      settings: data.settings,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `nexora-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <Card className="p-4 space-y-4">
        <div>
          <label className="text-sm text-muted">Имя</label>
          <Input
            value={settings.displayName}
            onChange={(e) => updateSettings({ displayName: e.target.value })}
            placeholder="Как к тебе обращаться"
          />
        </div>

        <div>
          <label className="text-sm text-muted">Тема</label>
          <Select
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as ThemeMode })}
          >
            <option value="dark">Тёмная</option>
            <option value="light">Светлая</option>
            <option value="system">Системная</option>
          </Select>
        </div>

        <div>
          <label className="text-sm text-muted">Акцентный цвет</label>
          <Input
            type="color"
            value={settings.accent}
            onChange={(e) => updateSettings({ accent: e.target.value })}
            className="h-10 w-20 p-1"
          />
        </div>

        <div>
          <label className="text-sm text-muted">Неделя начинается с</label>
          <Select
            value={String(settings.weekStartsOn)}
            onChange={(e) => updateSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
          >
            <option value="1">Понедельника</option>
            <option value="0">Воскресенья</option>
          </Select>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <h2 className="font-medium">Статусы и приоритеты задач</h2>
          <p className="mt-1 text-xs text-muted">Можно переименовать стандартные статусы и уровни приоритета. Изменения применяются к задачам, фильтрам и доске.</p>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Названия статусов</h3>
          {(Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([key, fallback]) => (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3">
              <label className="text-sm text-muted" htmlFor={"task-status-" + key}>{fallback}</label>
              <Input id={"task-status-" + key} value={settings.taskStatusLabels?.[key] ?? fallback} onChange={(event) => updateSettings({ taskStatusLabels: { ...settings.taskStatusLabels, [key]: event.target.value } })} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Названия приоритетов</h3>
          {(Object.entries(PRIORITY_LABEL) as [Priority, string][]).map(([key, fallback]) => (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3">
              <label className="text-sm text-muted" htmlFor={"task-priority-" + key}>{fallback}</label>
              <Input id={"task-priority-" + key} value={settings.taskPriorityLabels?.[key] ?? fallback} onChange={(event) => updateSettings({ taskPriorityLabels: { ...settings.taskPriorityLabels, [key]: event.target.value } })} />
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => updateSettings({ taskStatusLabels: {}, taskPriorityLabels: {} })}>Сбросить названия</Button>
      </Card>
      <Card className="p-4 space-y-3">
        <div>
          <h2 className="font-medium">Уведомления</h2>
          <p className="mt-1 text-xs text-muted">
            Nexora будет проверять напоминания и показывать системные уведомления, пока приложение открыто.
            Для работы нужно разрешение браузера.
          </p>
        </div>
        {typeof window !== "undefined" && "Notification" in window ? (
          <div className="flex flex-wrap items-center gap-2">
            {settings.notificationsEnabled ? (
              <Button variant="secondary" onClick={() => updateSettings({ notificationsEnabled: false })}>
                Отключить уведомления
              </Button>
            ) : (
              <Button onClick={async () => {
                const permission = await Notification.requestPermission()
                updateSettings({ notificationsEnabled: permission === "granted" })
              }}>
                Разрешить уведомления
              </Button>
            )}
            <span className="text-xs text-muted">
              Статус браузера: {Notification.permission === "granted" ? "разрешено" : Notification.permission === "denied" ? "запрещено" : "не запрошено"}
            </span>
          </div>
        ) : (
          <p className="text-xs text-amber-400">Этот браузер не поддерживает системные уведомления.</p>
        )}
        <p className="text-xs text-muted">
          Важно: локальные напоминания не срабатывают после полного закрытия браузера. Фоновая доставка через Push потребует отдельного сервера.
        </p>
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Данные</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportBackup}>Экспорт бэкапа</Button>
          <Button variant="secondary" onClick={() => loadSeed(true)}>Загрузить демо-данные</Button>
        </div>
      </Card>
    </div>
  )
}
