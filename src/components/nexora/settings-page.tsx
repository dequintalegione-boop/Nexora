import { useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { CURRENT_SCHEMA_VERSION } from "@/lib/nexora/migrate"
import type { ThemeMode, TaskStatus, Priority } from "@/lib/nexora/types"
import {
  getActiveTaskStatuses,
  getActiveTaskPriorities,
  getTaskStatusDefinitions,
  getTaskPriorityDefinitions,
  defaultTaskStatuses,
  defaultTaskPriorities,
} from "@/lib/nexora/copy"
import type { StatusDefinition, PriorityDefinition } from "@/lib/nexora/types"
import { Button, Card, Input, Select } from "./ui"
import { AutomationSettingsCard } from "./automation-settings"


function moveItem<T extends { order: number }>(items: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir
  if (next < 0 || next >= items.length) return items
  const copy = [...items]
  const tmp = copy[index]
  copy[index] = copy[next]
  copy[next] = tmp
  return copy.map((item, order) => ({ ...item, order }))
}

function StatusCatalogEditor() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const statuses = getTaskStatusDefinitions(settings)
  const [newLabel, setNewLabel] = useState("")
  const [newCategory, setNewCategory] = useState<StatusDefinition["category"]>("open")

  const commit = (next: StatusDefinition[]) => {
    updateSettings({
      taskStatuses: next.map((s, order) => ({ ...s, order })),
      taskStatusLabels: Object.fromEntries(next.map((s) => [s.id, s.label])),
    })
  }

  const addCustom = () => {
    const label = newLabel.trim()
    if (!label) return
    const id = `custom_${label.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_|_$/g, "") || "status"}_${Date.now().toString(36).slice(-4)}`
    commit([
      ...statuses,
      { id, label, category: newCategory, order: statuses.length, builtin: false },
    ])
    setNewLabel("")
    setNewCategory("open")
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Статусы</h3>
      {statuses.map((status, index) => (
        <div key={status.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
          <Input
            className="min-w-[8rem] flex-1"
            value={status.label}
            onChange={(e) => {
              const label = e.target.value
              commit(statuses.map((s) => (s.id === status.id ? { ...s, label } : s)))
            }}
          />
          <Select
            value={status.category}
            onChange={(e) => {
              const category = e.target.value as StatusDefinition["category"]
              commit(statuses.map((s) => (s.id === status.id ? { ...s, category } : s)))
            }}
            className="w-auto"
          >
            <option value="open">Открытый</option>
            <option value="done">Завершён</option>
            <option value="cancelled">Отмена</option>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => commit(moveItem(statuses, index, -1))} disabled={index === 0}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={() => commit(moveItem(statuses, index, 1))} disabled={index === statuses.length - 1}>
            ↓
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              commit(statuses.map((s) => (s.id === status.id ? { ...s, hidden: !s.hidden } : s)))
            }
          >
            {status.hidden ? "Показать" : "Скрыть"}
          </Button>
          {!status.builtin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => commit(statuses.filter((s) => s.id !== status.id))}
            >
              Удалить
            </Button>
          )}
          <span className="text-[10px] text-muted">{status.id}</span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Input
          className="min-w-[8rem] flex-1"
          placeholder="Новый статус"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <Select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as StatusDefinition["category"])}
          className="w-auto"
        >
          <option value="open">Открытый</option>
          <option value="done">Завершён</option>
          <option value="cancelled">Отмена</option>
        </Select>
        <Button size="sm" onClick={addCustom} disabled={!newLabel.trim()}>
          Добавить
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => commit(defaultTaskStatuses())}
        >
          Сбросить статусы
        </Button>
      </div>
    </div>
  )
}

function PriorityCatalogEditor() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const priorities = getTaskPriorityDefinitions(settings)
  const [newLabel, setNewLabel] = useState("")

  const commit = (next: PriorityDefinition[]) => {
    updateSettings({
      taskPriorities: next.map((p, order) => ({ ...p, order })),
      taskPriorityLabels: Object.fromEntries(next.map((p) => [p.id, p.label])),
    })
  }

  const addCustom = () => {
    const label = newLabel.trim()
    if (!label) return
    const id = `custom_${label.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_|_$/g, "") || "priority"}_${Date.now().toString(36).slice(-4)}`
    commit([...priorities, { id, label, order: priorities.length, builtin: false }])
    setNewLabel("")
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <h3 className="text-sm font-medium">Приоритеты</h3>
      {priorities.map((priority, index) => (
        <div key={priority.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
          <Input
            className="min-w-[8rem] flex-1"
            value={priority.label}
            onChange={(e) => {
              const label = e.target.value
              commit(priorities.map((p) => (p.id === priority.id ? { ...p, label } : p)))
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => commit(moveItem(priorities, index, -1))} disabled={index === 0}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={() => commit(moveItem(priorities, index, 1))} disabled={index === priorities.length - 1}>
            ↓
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              commit(priorities.map((p) => (p.id === priority.id ? { ...p, hidden: !p.hidden } : p)))
            }
          >
            {priority.hidden ? "Показать" : "Скрыть"}
          </Button>
          {!priority.builtin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => commit(priorities.filter((p) => p.id !== priority.id))}
            >
              Удалить
            </Button>
          )}
          <span className="text-[10px] text-muted">{priority.id}</span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Input
          className="min-w-[8rem] flex-1"
          placeholder="Новый приоритет"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <Button size="sm" onClick={addCustom} disabled={!newLabel.trim()}>
          Добавить
        </Button>
        <Button size="sm" variant="secondary" onClick={() => commit(defaultTaskPriorities())}>
          Сбросить приоритеты
        </Button>
      </div>
    </div>
  )
}


export function SettingsPage() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const loadSeed = useNexora((s) => s.loadSeed)

  const exportBackup = () => {
    const data = useNexora.getState()
    const backup = {
      schema: CURRENT_SCHEMA_VERSION,
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
      automationRules: data.automationRules ?? [],
      automationRuns: data.automationRuns ?? [],
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
          <p className="mt-1 text-xs text-muted">
            Можно переименовывать, скрывать, менять порядок и добавлять свои статусы и приоритеты.
            Скрытые значения не показываются в списках, но остаются на уже существующих задачах.
          </p>
        </div>

        <StatusCatalogEditor />

        <PriorityCatalogEditor />
      </Card>

      <AutomationSettingsCard />

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
              <Button
                onClick={async () => {
                  const permission = await Notification.requestPermission()
                  updateSettings({ notificationsEnabled: permission === "granted" })
                }}
              >
                Разрешить уведомления
              </Button>
            )}
            <span className="text-xs text-muted">
              Статус браузера:{" "}
              {Notification.permission === "granted"
                ? "разрешено"
                : Notification.permission === "denied"
                  ? "запрещено"
                  : "не запрошено"}
            </span>
          </div>
        ) : (
          <p className="text-xs text-amber-400">Этот браузер не поддерживает системные уведомления.</p>
        )}
        <p className="text-xs text-muted">
          Важно: локальные напоминания не срабатывают после полного закрытия браузера. Фоновая доставка через
          Push потребует отдельного сервера.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Данные</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportBackup}>
            Экспорт бэкапа
          </Button>
          <Button variant="secondary" onClick={() => loadSeed(true)}>
            Загрузить демо-данные
          </Button>
        </div>
      </Card>
    </div>
  )
}
