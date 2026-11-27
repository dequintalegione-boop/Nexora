import { useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import type {
  AutomationAction,
  AutomationConditionLeaf,
  AutomationConditionNode,
  AutomationTrigger,
} from "@/lib/nexora/automations"
import type { ThemeMode, TaskStatus, Priority } from "@/lib/nexora/types"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import { Button, Card, Input, Select } from "./ui"

type ConditionField = "status" | "priority" | "project" | "tag" | "title"

function formatCondition(cond: AutomationConditionLeaf, projects: { id: string; title: string }[]): string {
  switch (cond.field) {
    case "status":
      return `статус = ${STATUS_LABEL[cond.value] ?? cond.value}`
    case "priority":
      return `приоритет = ${PRIORITY_LABEL[cond.value] ?? cond.value}`
    case "project": {
      const title = projects.find((p) => p.id === cond.value)?.title ?? cond.value
      return `проект = ${title}`
    }
    case "tag":
      return `метка содержит «${cond.value}»`
    case "title":
      return `название содержит «${cond.value}»`
  }
}

function formatConditionsSummary(
  conditions: AutomationConditionNode[] | AutomationConditionLeaf[],
  projects: { id: string; title: string }[],
): string {
  if (!conditions || conditions.length === 0) return "без условий"

  // Single explicit group
  if (conditions.length === 1 && "operator" in conditions[0]) {
    const group = conditions[0] as { operator: "and" | "or"; conditions: AutomationConditionNode[] }
    const parts = group.conditions
      .filter((c): c is AutomationConditionLeaf => !("operator" in c))
      .map((c) => formatCondition(c, projects))
    if (parts.length === 0) return "без условий"
    return parts.join(group.operator === "or" ? " ИЛИ " : " И ")
  }

  // Flat list (AND)
  const leaves = conditions.filter((c): c is AutomationConditionLeaf => !("operator" in c))
  if (leaves.length === 0) return "без условий"
  return leaves.map((c) => formatCondition(c, projects)).join(" И ")
}

function formatAction(action: AutomationAction, projects: { id: string; title: string }[]): string {
  switch (action.type) {
    case "set_status":
      return `статус → ${STATUS_LABEL[action.value] ?? action.value}`
    case "set_priority":
      return `приоритет → ${PRIORITY_LABEL[action.value] ?? action.value}`
    case "assign_project": {
      const title = projects.find((p) => p.id === action.value)?.title ?? action.value
      return `проект → ${title}`
    }
    case "add_tag":
      return `+ метка «${action.value}»`
    case "remove_tag":
      return `− метка «${action.value}»`
    case "set_due_offset":
      return `срок через ${action.days} дн.`
  }
}

const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  "task.created": "Создание задачи",
  "task.status_changed": "Смена статуса",
  "task.completed": "Завершение задачи",
}

export function SettingsPage() {
  const settings = useNexora((s) => s.settings)
  const updateSettings = useNexora((s) => s.updateSettings)
  const loadSeed = useNexora((s) => s.loadSeed)
  const automationRules = useNexora((s) => s.automationRules ?? [])
  const automationRuns = useNexora((s) => s.automationRuns ?? [])
  const projects = useNexora((s) => s.projects)
  const addAutomationRule = useNexora((s) => s.addAutomationRule)
  const updateAutomationRule = useNexora((s) => s.updateAutomationRule)
  const removeAutomationRule = useNexora((s) => s.removeAutomationRule)

  const [ruleName, setRuleName] = useState("")
  const [trigger, setTrigger] = useState<AutomationTrigger>("task.created")
  const [actionType, setActionType] = useState<AutomationAction["type"]>("set_priority")
  const [actionValue, setActionValue] = useState("high")
  const [conditionField, setConditionField] = useState<ConditionField | "none">("none")
  const [conditionValue, setConditionValue] = useState("")
  const [draftConditions, setDraftConditions] = useState<AutomationConditionLeaf[]>([])
  const [logic, setLogic] = useState<"and" | "or">("and")
  const [runFilter, setRunFilter] = useState<"all" | "success" | "skipped">("all")

  const addConditionToDraft = () => {
    if (conditionField === "none" || !conditionValue.trim()) return
    let condition: AutomationConditionLeaf
    if (conditionField === "status") {
      condition = { field: "status", operator: "is", value: conditionValue as TaskStatus }
    } else if (conditionField === "priority") {
      condition = { field: "priority", operator: "is", value: conditionValue as Priority }
    } else if (conditionField === "project") {
      condition = { field: "project", operator: "is", value: conditionValue }
    } else if (conditionField === "tag") {
      condition = { field: "tag", operator: "contains", value: conditionValue.trim() }
    } else {
      condition = { field: "title", operator: "contains", value: conditionValue.trim() }
    }
    setDraftConditions((prev) => [...prev, condition])
    setConditionField("none")
    setConditionValue("")
  }

  const removeDraftCondition = (index: number) => {
    setDraftConditions((prev) => prev.filter((_, i) => i !== index))
  }

  const createAutomation = () => {
    const name = ruleName.trim()
    if (!name) return
    let action: AutomationAction
    if (actionType === "set_status") action = { type: actionType, value: actionValue as TaskStatus }
    else if (actionType === "set_priority") action = { type: actionType, value: actionValue as Priority }
    else if (actionType === "set_due_offset") action = { type: actionType, days: Number(actionValue) || 1 }
    else action = { type: actionType, value: actionValue }

    // Build condition tree
    let conditions: AutomationConditionNode[]
    if (draftConditions.length === 0) {
      conditions = []
    } else if (draftConditions.length === 1 || logic === "and") {
      // Flat array = AND (backward compatible)
      conditions = draftConditions
    } else {
      // Explicit OR group
      conditions = [{ operator: "or", conditions: draftConditions }]
    }

    addAutomationRule({ name, enabled: true, trigger, conditions, action })
    setRuleName("")
    setDraftConditions([])
    setConditionValue("")
    setConditionField("none")
    setLogic("and")
  }

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

  const filteredRuns = automationRuns.filter((run) => {
    if (runFilter === "all") return true
    return run.result === runFilter
  })

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
          <p className="mt-1 text-xs text-muted">Можно переименовать стандартные значения. Ключи внутри системы остаются прежними.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["inbox", "planned", "in_progress", "waiting", "done", "cancelled"] as TaskStatus[]).map((key) => {
            const fallback = STATUS_LABEL[key]
            return (
              <div key={key}>
                <label className="text-xs text-muted" htmlFor={"task-status-" + key}>{fallback}</label>
                <Input
                  id={"task-status-" + key}
                  value={settings.taskStatusLabels?.[key] ?? fallback}
                  onChange={(event) =>
                    updateSettings({
                      taskStatusLabels: { ...settings.taskStatusLabels, [key]: event.target.value },
                    })
                  }
                />
              </div>
            )
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["none", "low", "medium", "high", "critical"] as Priority[]).map((key) => {
            const fallback = PRIORITY_LABEL[key]
            return (
              <div key={key}>
                <label className="text-xs text-muted" htmlFor={"task-priority-" + key}>{fallback}</label>
                <Input
                  id={"task-priority-" + key}
                  value={settings.taskPriorityLabels?.[key] ?? fallback}
                  onChange={(event) =>
                    updateSettings({
                      taskPriorityLabels: { ...settings.taskPriorityLabels, [key]: event.target.value },
                    })
                  }
                />
              </div>
            )
          })}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => updateSettings({ taskStatusLabels: {}, taskPriorityLabels: {} })}
        >
          Сбросить названия
        </Button>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <h2 className="font-medium">Автоматизации задач</h2>
          <p className="mt-1 text-xs text-muted">
            Локальные правила: событие → условия (И / ИЛИ) → действие. Выполняются внутри Nexora.
          </p>
        </div>

        <div className="space-y-3">
          <Input
            value={ruleName}
            onChange={(event) => setRuleName(event.target.value)}
            placeholder="Название правила"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={trigger} onChange={(event) => setTrigger(event.target.value as AutomationTrigger)}>
              <option value="task.created">При создании задачи</option>
              <option value="task.status_changed">При смене статуса</option>
              <option value="task.completed">При завершении задачи</option>
            </Select>

            <Select
              value={logic}
              onChange={(event) => setLogic(event.target.value as "and" | "or")}
              disabled={draftConditions.length < 2}
            >
              <option value="and">Все условия (И)</option>
              <option value="or">Любое условие (ИЛИ)</option>
            </Select>
          </div>

          {/* Draft conditions list */}
          {draftConditions.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border p-2">
              <p className="text-xs text-muted mb-1">Условия ({logic === "or" ? "ИЛИ" : "И"}):</p>
              {draftConditions.map((cond, index) => (
                <div key={index} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{formatCondition(cond, projects)}</span>
                  <Button size="sm" variant="ghost" onClick={() => removeDraftCondition(index)}>
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add condition controls */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={conditionField}
              onChange={(event) => {
                setConditionField(event.target.value as ConditionField | "none")
                setConditionValue("")
              }}
            >
              <option value="none">Добавить условие…</option>
              <option value="status">Статус задачи</option>
              <option value="priority">Приоритет задачи</option>
              <option value="project">Проект</option>
              <option value="tag">Метка</option>
              <option value="title">Название содержит</option>
            </Select>

            {conditionField === "status" ? (
              <Select value={conditionValue} onChange={(event) => setConditionValue(event.target.value)}>
                <option value="">Выберите статус</option>
                {(["inbox", "planned", "in_progress", "waiting", "done", "cancelled"] as TaskStatus[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ),
                )}
              </Select>
            ) : conditionField === "priority" ? (
              <Select value={conditionValue} onChange={(event) => setConditionValue(event.target.value)}>
                <option value="">Выберите приоритет</option>
                {(["none", "low", "medium", "high", "critical"] as Priority[]).map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABEL[value]}
                  </option>
                ))}
              </Select>
            ) : conditionField === "project" ? (
              <Select value={conditionValue} onChange={(event) => setConditionValue(event.target.value)}>
                <option value="">Выберите проект</option>
                {projects
                  .filter((project) => !project.archived)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
              </Select>
            ) : (
              <Input
                value={conditionValue}
                onChange={(event) => setConditionValue(event.target.value)}
                placeholder={
                  conditionField === "tag"
                    ? "Название метки"
                    : conditionField === "title"
                      ? "Фрагмент названия"
                      : "Не требуется"
                }
                disabled={conditionField === "none"}
              />
            )}
          </div>

          {conditionField !== "none" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={addConditionToDraft}
              disabled={!conditionValue.trim()}
            >
              Добавить условие
            </Button>
          )}

          {/* Action */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={actionType}
              onChange={(event) => {
                const value = event.target.value as AutomationAction["type"]
                setActionType(value)
                setActionValue(
                  value === "set_status"
                    ? "planned"
                    : value === "set_priority"
                      ? "high"
                      : value === "set_due_offset"
                        ? "1"
                        : "",
                )
              }}
            >
              <option value="set_status">Изменить статус</option>
              <option value="set_priority">Изменить приоритет</option>
              <option value="assign_project">Назначить проект</option>
              <option value="add_tag">Добавить метку</option>
              <option value="remove_tag">Убрать метку</option>
              <option value="set_due_offset">Установить срок через N дней</option>
            </Select>

            {actionType === "set_status" ? (
              <Select value={actionValue} onChange={(event) => setActionValue(event.target.value)}>
                {(["inbox", "planned", "in_progress", "waiting", "done", "cancelled"] as TaskStatus[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ),
                )}
              </Select>
            ) : actionType === "set_priority" ? (
              <Select value={actionValue} onChange={(event) => setActionValue(event.target.value)}>
                {(["none", "low", "medium", "high", "critical"] as Priority[]).map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABEL[value]}
                  </option>
                ))}
              </Select>
            ) : actionType === "assign_project" ? (
              <Select value={actionValue} onChange={(event) => setActionValue(event.target.value)}>
                <option value="">Выберите проект</option>
                {projects
                  .filter((project) => !project.archived)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
              </Select>
            ) : (
              <Input
                type={actionType === "set_due_offset" ? "number" : "text"}
                value={actionValue}
                onChange={(event) => setActionValue(event.target.value)}
                placeholder={actionType === "set_due_offset" ? "Количество дней" : "Значение"}
              />
            )}
          </div>

          <Button
            size="sm"
            onClick={createAutomation}
            disabled={!ruleName.trim() || !actionValue.trim()}
          >
            Создать правило
          </Button>
        </div>

        {/* Existing rules */}
        <div className="space-y-2">
          {automationRules.length === 0 ? (
            <p className="text-xs text-muted">Пока нет правил автоматизации.</p>
          ) : (
            automationRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{rule.name}</p>
                  <p className="text-xs text-muted">
                    {TRIGGER_LABEL[rule.trigger]} · {formatAction(rule.action, projects)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatConditionsSummary(rule.conditions, projects)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateAutomationRule(rule.id, { enabled: !rule.enabled })}
                  >
                    {rule.enabled ? "Вкл." : "Выкл."}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeAutomationRule(rule.id)}>
                    Удалить
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Run history with filter */}
        {automationRuns.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">История запусков</h3>
              <Select
                value={runFilter}
                onChange={(e) => setRunFilter(e.target.value as "all" | "success" | "skipped")}
                className="w-auto text-xs"
              >
                <option value="all">Все</option>
                <option value="success">Выполненные</option>
                <option value="skipped">Пропуски</option>
              </Select>
            </div>
            {filteredRuns.slice(0, 20).map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  {automationRules.find((rule) => rule.id === run.ruleId)?.name ?? "Удалённое правило"} ·{" "}
                  {run.message}
                </span>
                <span className={run.result === "success" ? "text-emerald-500" : "text-muted"}>
                  {run.result === "success" ? "Выполнено" : "Пропуск"}
                </span>
              </div>
            ))}
            {filteredRuns.length === 0 && (
              <p className="text-xs text-muted">Нет записей по выбранному фильтру.</p>
            )}
          </div>
        )}
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
              <Button
                onClick={async () => {
                  const permission = await Notification.requestPermission()
                  updateSettings({ notificationsEnabled: permission === "granted" })
                }
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
