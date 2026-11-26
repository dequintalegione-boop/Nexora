import { useNexora } from "@/lib/nexora/store"
import type { ThemeMode } from "@/lib/nexora/types"
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
