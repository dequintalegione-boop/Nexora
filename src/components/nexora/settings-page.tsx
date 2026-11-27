import { useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import {
  createNexoraBackup,
  MAX_BACKUP_FILE_BYTES,
  parseNexoraBackup,
  serializeNexoraBackup,
} from "@/lib/nexora/backup"
import type { ParsedNexoraBackup } from "@/lib/nexora/backup"
import type { ThemeMode, TaskStatus, Priority, Persisted } from "@/lib/nexora/types"
import {
  getTaskStatusDefinitions,
  getTaskPriorityDefinitions,
  defaultTaskStatuses,
  defaultTaskPriorities,
  getFallbackStatusId,
  getFallbackPriorityId,
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

function downloadJsonBackup(backup: ReturnType<typeof createNexoraBackup>, prefix: string): void {
  const blob = new Blob([serializeNexoraBackup(backup)], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = prefix + "-" + new Date().toISOString().slice(0, 10) + ".json"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function StatusCatalogEditor() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const tasks = useNexora((s) => s.tasks)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const statuses = getTaskStatusDefinitions(settings)
  const [newLabel, setNewLabel] = useState("")
  const [newCategory, setNewCategory] = useState<StatusDefinition["category"]>("open")

  const commit = (next: StatusDefinition[]) => {
    updateSettings({
      taskStatuses: next.map((s, order) => ({ ...s, order })),
      taskStatusLabels: Object.fromEntries(next.map((s) => [s.id, s.label])),
    })
  }

  const removeStatus = (id: string) => {
    const affected = tasks.filter((t) => t.status === id && !t.deletedAt)
    if (affected.length > 0) {
      const fallback = getFallbackStatusId(settings, id)
      for (const task of affected) {
        setTaskStatus(task.id, fallback as TaskStatus)
      }
    }
    commit(statuses.filter((s) => s.id !== id))
  }

  const addCustom = () => {
    const label = newLabel.trim()
    if (!label) return
    const id = "custom_" + (label.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_|_$/g, "") || "status") + "_" + Date.now().toString(36).slice(-4)
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
              onClick={() => removeStatus(status.id)}
              title="Задачи с этим статусом будут переведены на запасной статус"
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
        <Button size="sm" variant="secondary" onClick={() => commit(defaultTaskStatuses())}>
          Сбросить статусы
        </Button>
      </div>
    </div>
  )
}

function PriorityCatalogEditor() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const tasks = useNexora((s) => s.tasks)
  const updateTask = useNexora((s) => s.updateTask)
  const priorities = getTaskPriorityDefinitions(settings)
  const [newLabel, setNewLabel] = useState("")

  const commit = (next: PriorityDefinition[]) => {
    updateSettings({
      taskPriorities: next.map((p, order) => ({ ...p, order })),
      taskPriorityLabels: Object.fromEntries(next.map((p) => [p.id, p.label])),
    })
  }

  const removePriority = (id: string) => {
    const affected = tasks.filter((t) => t.priority === id && !t.deletedAt)
    if (affected.length > 0) {
      const fallback = getFallbackPriorityId(settings, id)
      for (const task of affected) {
        updateTask(task.id, { priority: fallback as Priority })
      }
    }
    commit(priorities.filter((p) => p.id !== id))
  }

  const addCustom = () => {
    const label = newLabel.trim()
    if (!label) return
    const id = "custom_" + (label.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_|_$/g, "") || "priority") + "_" + Date.now().toString(36).slice(-4)
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
              onClick={() => removePriority(priority.id)}
              title="Задачи с этим приоритетом будут переведены на запасной приоритет"
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
  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<ParsedNexoraBackup | null>(null)
  const [importError, setImportError] = useState("")
  const [importNotice, setImportNotice] = useState("")

  const exportBackup = () => {
    const data = useNexora.getState()
    const ui = useUI.getState()
    const backup = createNexoraBackup(data, {
      savedTaskViews: ui.savedTaskViews,
      taskTableColumns: ui.taskTableColumns,
      kanbanGroupBy: ui.kanbanGroupBy,
      taskTemplates: ui.taskTemplates,
    })
    downloadJsonBackup(backup, "nexora-backup")
    setImportNotice("JSON-бэкап создан. Храните файл отдельно от устройства.")
    setImportError("")
  }

  const selectBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setImportNotice("")
    setImportError("")
    setImportPreview(null)

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setImportError("Файл слишком большой. Максимальный размер — 25 МБ.")
      return
    }

    try {
      const parsed = parseNexoraBackup(await file.text())
      setImportPreview(parsed)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Не удалось проверить резервную копию.")
    }
  }

  const restoreBackup = () => {
    if (!importPreview) return
    const confirmed = window.confirm(
      "Восстановление полностью заменит текущие данные Nexora. Перед заменой будет скачан отдельный JSON-бэкап текущего профиля. Продолжить?",
    )
    if (!confirmed) return

    try {
      const currentData: Persisted = useNexora.getState()
      const currentUI = useUI.getState()
      const safetyBackup = createNexoraBackup(currentData, {
        savedTaskViews: currentUI.savedTaskViews,
        taskTableColumns: currentUI.taskTableColumns,
        kanbanGroupBy: currentUI.kanbanGroupBy,
        taskTemplates: currentUI.taskTemplates,
      })
      downloadJsonBackup(safetyBackup, "nexora-pre-restore")

      useNexora.getState().replaceAll(importPreview.data)
      if (importPreview.ui) {
        useUI.setState(importPreview.ui)
      }

      setImportPreview(null)
      setImportNotice("Данные восстановлены. Предыдущий профиль сохранён в скачанном файле nexora-pre-restore.")
      setImportError("")
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Не удалось восстановить резервную копию.")
    }
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
        <div>
          <h2 className="font-medium">Данные</h2>
          <p className="text-xs text-muted">
            Бэкап содержит коллекции Nexora, таймер, настройки, правила автоматизации, сохранённые представления,
            выбранные колонки, группировку Kanban и шаблоны задач.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportBackup}>
            Экспорт JSON-бэкапа
          </Button>
          <Button variant="secondary" onClick={() => backupInputRef.current?.click()}>
            Проверить и восстановить из файла
          </Button>
          <Button variant="secondary" onClick={() => loadSeed(true)}>
            Загрузить демо-данные
          </Button>
        </div>
        <input
          ref={backupInputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={selectBackupFile}
        />
        {importError && <p role="alert" className="text-sm text-red-400">{importError}</p>}
        {importNotice && <p role="status" className="text-sm text-emerald-400">{importNotice}</p>}
        {importPreview && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <h3 className="text-sm font-medium">Предпросмотр резервной копии</h3>
              <p className="mt-1 text-xs text-muted">
                {importPreview.isLegacy ? "Старый формат JSON" : "Формат Nexora v1"} ·
                {importPreview.exportedAt ? " экспортировано " + new Date(importPreview.exportedAt).toLocaleString() : " дата экспорта не указана"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Задачи: <strong>{importPreview.data.tasks.length}</strong></div>
              <div>Проекты: <strong>{importPreview.data.projects.length}</strong></div>
              <div>Направления: <strong>{importPreview.data.directions.length}</strong></div>
              <div>Привычки: <strong>{importPreview.data.habits.length}</strong></div>
              <div>Записи дневника: <strong>{importPreview.data.entries.length}</strong></div>
              <div>Цели: <strong>{importPreview.data.goals.length}</strong></div>
              <div>Сессии: <strong>{importPreview.data.sessions.length}</strong></div>
              <div>Правила автоматизации: <strong>{importPreview.data.automationRules?.length ?? 0}</strong></div>
            </div>
            {importPreview.ui && (
              <p className="text-xs text-muted">
                Также восстановятся {importPreview.ui.savedTaskViews?.length ?? 0} представлений задач и{" "}
                {importPreview.ui.taskTemplates?.length ?? 0} шаблонов.
              </p>
            )}
            {importPreview.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-400">
                {importPreview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            )}
            <p className="text-xs text-muted">
              Восстановление заменит текущий профиль. Перед заменой будет автоматически скачана резервная копия
              текущего состояния.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={restoreBackup}>Скачать страховочную копию и восстановить</Button>
              <Button variant="ghost" onClick={() => setImportPreview(null)}>Отмена</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
