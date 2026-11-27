import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { getStatusSelectOptions, getPrioritySelectOptions } from "@/lib/nexora/copy"
import type { RecurrenceFrequency } from "@/lib/nexora/types"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Textarea } from "./ui"
import { getDependencyState, getTaskChildren } from "@/lib/nexora/task-logic"

export function TaskDialog() {
  const taskId = useUI((s) => s.taskId)
  const setTaskId = useUI((s) => s.setTaskId)
  const taskOccurrence = useUI((s) => s.taskOccurrence)
  const setTaskOccurrence = useUI((s) => s.setTaskOccurrence)
  const tasks = useNexora((s) => s.tasks)
  const settings = useNexora((s) => s.settings)
  const addTask = useNexora((s) => s.addTask)
  const projects = useNexora((s) => s.projects)
  const updateTask = useNexora((s) => s.updateTask)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const skipTaskOccurrence = useNexora((s) => s.skipTaskOccurrence)
  const skipVirtualTaskOccurrence = useNexora((s) => s.skipVirtualTaskOccurrence)
  const materializeTaskOccurrence = useNexora((s) => s.materializeTaskOccurrence)
  const updateRecurrenceSeries = useNexora((s) => s.updateRecurrenceSeries)
  const archiveTask = useNexora((s) => s.archiveTask)
  const restoreTask = useNexora((s) => s.restoreTask)
  const startTimer = useNexora((s) => s.startTimer)
  const activeTimer = useNexora((s) => s.activeTimer)
  const setTaskParent = useNexora((s) => s.setTaskParent)
  const addTaskDependency = useNexora((s) => s.addTaskDependency)
  const removeTaskDependency = useNexora((s) => s.removeTaskDependency)

  const task = tasks.find((t) => t.id === taskId)
  if (!task) return null

  const selectedOccurrence = taskOccurrence?.seriesId === task.id ? taskOccurrence : null
  if (selectedOccurrence) {
    const occurrenceDateLabel = new Date(`${selectedOccurrence.occurrenceDate}T12:00:00`).toLocaleDateString("ru-RU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    })
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTaskId(null)}>
        <Card className="w-full max-w-md space-y-4 p-5" onClick={(event) => event.stopPropagation()}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-300">Повторяющаяся задача</p>
            <h2 className="mt-1 text-lg font-semibold">{task.title}</h2>
            <p className="mt-1 text-sm capitalize text-muted">{occurrenceDateLabel}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 text-sm text-muted">
            Это виртуальный экземпляр. Выберите действие, чтобы не изменить всю серию случайно.
          </div>
          <div className="grid gap-2">
            <Button onClick={() => {
              const instanceId = materializeTaskOccurrence(selectedOccurrence.task)
              if (instanceId) {
                setTaskOccurrence(null)
                setTaskId(instanceId)
              }
            }}>
              Изменить только это повторение
            </Button>
            <Button variant="secondary" onClick={() => {
              if (skipVirtualTaskOccurrence(selectedOccurrence.seriesId, selectedOccurrence.occurrenceDate)) {
                setTaskId(null)
              }
            }}>
              Пропустить только эту дату
            </Button>
            <Button variant="ghost" onClick={() => setTaskOccurrence(null)}>
              Редактировать всю серию
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setTaskId(null)}>Закрыть</Button>
          </div>
        </Card>
      </div>
    )
  }

  const dependencyState = getDependencyState(task, tasks)
  const children = getTaskChildren(tasks, task.id)
  const statusOptions = getStatusSelectOptions(settings, task.status)
  const priorityOptions = getPrioritySelectOptions(settings, task.priority)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTaskId(null)}>
      <Card className="w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        {task.recurrenceParentId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-400/20 bg-teal-400/[0.06] p-3">
            <p className="min-w-0 flex-1 text-xs text-teal-100">
              Отдельный экземпляр повторения. Изменения затрагивают только эту дату.
            </p>
            <Button size="sm" variant="secondary" onClick={() => {
              setTaskOccurrence(null)
              setTaskId(task.recurrenceParentId!)
            }}>
              Открыть серию
            </Button>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <Input
            value={task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
            className="text-lg font-medium"
          />
          <Button variant="ghost" size="sm" onClick={() => setTaskId(null)}>✕</Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Статус</label>
            <Select value={task.status} onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)}>
              {statusOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted">Приоритет</label>
            <Select value={task.priority} onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}>
              {priorityOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Запланировано на</label>
            <Input
              type="date"
              value={task.scheduledDate ?? ""}
              onChange={(e) => updateTask(task.id, { scheduledDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Срок выполнения</label>
            <Input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => updateTask(task.id, { dueDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Оценка, минут</label>
            <Input
              type="number"
              min={0}
              value={task.estimatedMinutes ?? ""}
              onChange={(e) => updateTask(task.id, { estimatedMinutes: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
            />
            <p className="mt-1 text-xs text-muted">Фактически: {task.actualMinutes ?? 0} мин.</p>
          </div>
          <div>
            <label className="text-xs text-muted">Родительская задача</label>
            <Select
              className="w-full"
              value={task.parentId ?? ""}
              onChange={(e) => setTaskParent(task.id, e.target.value || undefined)}
            >
              <option value="">Нет</option>
              {tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.archived).map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="text-xs text-muted">Проекты</label>
          <div className="grid gap-1 sm:grid-cols-2">
            {projects.filter((project) => !project.archived).map((project) => {
              const selectedIds = task.projectIds ?? (task.projectId ? [task.projectId] : [])
              const selected = selectedIds.includes(project.id)
              return (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const nextIds = e.target.checked
                        ? [...selectedIds, project.id]
                        : selectedIds.filter((id) => id !== project.id)
                      updateTask(task.id, { projectIds: nextIds, projectId: nextIds[0] })
                    }}
                  />
                  <span className="truncate">{project.title}</span>
                </label>
              )
            })}
            {projects.filter((project) => !project.archived).length === 0 && <p className="text-xs text-muted">Нет активных проектов</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Метки (через запятую)</label>
            <Input
              className="w-full"
              value={(task.tags ?? []).join(", ")}
              onChange={(e) => updateTask(task.id, { tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Контексты (через запятую)</label>
            <Input
              className="w-full"
              value={(task.contexts ?? []).join(", ")}
              onChange={(e) => updateTask(task.id, { contexts: e.target.value.split(",").map((context) => context.trim()).filter(Boolean) })}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-white/10 p-3">
          <div>
            <label className="text-xs text-muted">Напоминания</label>
            <p className="mt-1 text-xs text-muted">Добавьте уведомление перед началом, сроком или на точное время.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => updateTask(task.id, {
              reminders: [...(task.reminders ?? []), {
                id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                minutesBefore: 15,
                anchor: "start",
                enabled: true,
              }],
            })}>За 15 мин. до начала</Button>
            <Button size="sm" variant="secondary" onClick={() => updateTask(task.id, {
              reminders: [...(task.reminders ?? []), {
                id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                minutesBefore: 1440,
                anchor: "due",
                enabled: true,
              }],
            })}>За день до срока</Button>
            <Button size="sm" variant="secondary" onClick={() => updateTask(task.id, {
              reminders: [...(task.reminders ?? []), {
                id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                at: "",
                enabled: true,
              }],
            })}>Точное время</Button>
          </div>
          <div className="space-y-2">
            {(task.reminders ?? []).map((reminder) => (
              <div key={reminder.id} className="flex items-center gap-2">
                {reminder.at !== undefined ? (
                  <Input
                    className="min-w-0 flex-1"
                    type="datetime-local"
                    value={reminder.at}
                    onChange={(event) => updateTask(task.id, {
                      reminders: task.reminders?.map((item) => item.id === reminder.id
                        ? { ...item, at: event.target.value || undefined, lastTriggeredAt: undefined }
                        : item),
                    })}
                  />
                ) : (
                  <span className="min-w-0 flex-1 text-sm">
                    За {reminder.minutesBefore ?? 0} мин. до {reminder.anchor === "due" ? "срока" : "начала"}
                  </span>
                )}
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={reminder.enabled}
                    onChange={(event) => updateTask(task.id, {
                      reminders: task.reminders?.map((item) => item.id === reminder.id
                        ? { ...item, enabled: event.target.checked, lastTriggeredAt: undefined }
                        : item),
                    })}
                  />
                  Вкл.
                </label>
                <Button size="sm" variant="ghost" onClick={() => updateTask(task.id, {
                  reminders: task.reminders?.filter((item) => item.id !== reminder.id),
                })}>Удалить</Button>
              </div>
            ))}
            {(task.reminders ?? []).length === 0 && <p className="text-xs text-muted">Напоминания пока не добавлены</p>}
          </div>
          <p className="text-xs text-muted">Для доставки нужны разрешение браузера и открытое приложение Nexora. После закрытия браузера локальный таймер не работает.</p>
        </div>

        {!task.recurrenceParentId && (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="text-xs text-muted">Повторение задачи</label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              className="w-full"
              value={task.recurrenceRule?.frequency ?? task.repeat ?? ""}
              onChange={(e) => {
                const frequency = e.target.value as RecurrenceFrequency | ""
                const hadRule = Boolean(task.recurrenceRule || task.repeat)
                const today = new Date()
                const localToday = [
                  today.getFullYear(),
                  String(today.getMonth() + 1).padStart(2, "0"),
                  String(today.getDate()).padStart(2, "0"),
                ].join("-")
                const recurrenceStartDate = hadRule
                  ? task.recurrenceStartDate ?? task.occurrenceDate ?? task.scheduledDate ?? task.dueDate ?? task.startAt?.slice(0, 10) ?? localToday
                  : task.occurrenceDate ?? task.scheduledDate ?? task.dueDate ?? task.startAt?.slice(0, 10) ?? localToday
                updateTask(task.id, {
                  repeat: frequency === "daily" || frequency === "weekly" ? frequency : undefined,
                  recurrenceParentId: frequency && !hadRule ? undefined : task.recurrenceParentId,
                  occurrenceDate: frequency && !hadRule ? task.occurrenceDate ?? recurrenceStartDate : task.occurrenceDate,
                  occurrenceNumber: frequency && !hadRule ? 1 : task.occurrenceNumber,
                  skippedOccurrences: frequency && !hadRule ? [] : task.skippedOccurrences,
                  recurrenceStartDate: frequency ? recurrenceStartDate : task.recurrenceStartDate,
                  recurrenceStartScheduledDate: frequency
                    ? hadRule
                      ? task.recurrenceStartScheduledDate ?? task.scheduledDate
                      : task.scheduledDate
                    : task.recurrenceStartScheduledDate,
                  recurrenceStartDueDate: frequency
                    ? hadRule
                      ? task.recurrenceStartDueDate ?? task.dueDate
                      : task.dueDate
                    : task.recurrenceStartDueDate,
                  recurrenceStartStartAt: frequency
                    ? hadRule
                      ? task.recurrenceStartStartAt ?? task.startAt
                      : task.startAt
                    : task.recurrenceStartStartAt,
                  recurrenceStartEndAt: frequency
                    ? hadRule
                      ? task.recurrenceStartEndAt ?? task.endAt
                      : task.endAt
                    : task.recurrenceStartEndAt,
                  recurrenceRule: frequency
                    ? {
                        ...task.recurrenceRule,
                        frequency,
                        interval: task.recurrenceRule?.interval ?? 1,
                        until: task.recurrenceRule?.until,
                        count: task.recurrenceRule?.count,
                        weekdays: frequency === "weekly" ? task.recurrenceRule?.weekdays : undefined,
                        byDay: frequency === "monthly" || frequency === "yearly" ? task.recurrenceRule?.byDay : undefined,
                        byMonthDay: frequency === "monthly" || frequency === "yearly" ? task.recurrenceRule?.byMonthDay : undefined,
                        byMonth: frequency === "yearly" ? task.recurrenceRule?.byMonth : undefined,
                      }
                    : undefined,
                })
              }}
            >
              <option value="">Не повторять</option>
              <option value="daily">Каждый день</option>
              <option value="weekly">Каждую неделю</option>
              <option value="monthly">Каждый месяц</option>
              <option value="yearly">Каждый год</option>
            </Select>
            {task.recurrenceRule && (
              <Input
                type="number"
                min={1}
                max={10000}
                aria-label="Интервал повторения"
                value={task.recurrenceRule.interval}
                onChange={(e) => updateTask(task.id, {
                  recurrenceRule: {
                    ...task.recurrenceRule!,
                    interval: Math.min(10000, Math.max(1, Number(e.target.value) || 1)),
                  },
                })}
              />
            )}
          </div>

          {task.recurrenceRule?.frequency === "weekly" && (
            <div className="mt-2">
              <label className="text-xs text-muted">Дни недели (если не выбраны — день недели даты начала)</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { value: 1, label: "Пн" },
                  { value: 2, label: "Вт" },
                  { value: 3, label: "Ср" },
                  { value: 4, label: "Чт" },
                  { value: 5, label: "Пт" },
                  { value: 6, label: "Сб" },
                  { value: 0, label: "Вс" },
                ].map((day) => {
                  const selected = task.recurrenceRule?.weekdays ?? []
                  const checked = selected.includes(day.value)
                  return (
                    <label key={day.value} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const weekdays = e.target.checked
                            ? [...selected, day.value].sort((a, b) => a - b)
                            : selected.filter((value) => value !== day.value)
                          updateTask(task.id, {
                            recurrenceRule: {
                              ...task.recurrenceRule!,
                              weekdays: weekdays.length ? weekdays : undefined,
                            },
                          })
                        }}
                      />
                      {day.label}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {(task.recurrenceRule?.frequency === "monthly" || task.recurrenceRule?.frequency === "yearly") && (
            <div className="space-y-2 rounded-md border border-white/10 p-2">
              <p className="text-xs font-medium text-muted">Правило по календарю</p>
              <div>
                <label className="text-xs text-muted">День месяца (BYMONTHDAY, можно несколько через запятую; −1 — последний)</label>
                <Input
                  className="w-full"
                  value={(task.recurrenceRule.byMonthDay ?? []).join(", ")}
                  placeholder="Например: 1, 15, -1"
                  onChange={(e) => {
                    const values = e.target.value
                      .split(",")
                      .map((value) => Number(value.trim()))
                      .filter((value) => Number.isInteger(value) && value !== 0 && Math.abs(value) <= 31)
                    updateTask(task.id, {
                      recurrenceRule: {
                        ...task.recurrenceRule!,
                        byMonthDay: values.length ? [...new Set(values)] : undefined,
                      },
                    })
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted">Порядковый день недели (BYDAY)</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Select
                    value={task.recurrenceRule.byDay?.[0] ? String(task.recurrenceRule.byDay[0].weekday) : ""}
                    onChange={(e) => {
                      const weekday = e.target.value === "" ? undefined : Number(e.target.value)
                      updateTask(task.id, {
                        recurrenceRule: {
                          ...task.recurrenceRule!,
                          byDay: weekday === undefined
                            ? undefined
                            : [{ weekday, ordinal: task.recurrenceRule?.byDay?.[0]?.ordinal ?? 1 }],
                        },
                      })
                    }}
                  >
                    <option value="">Без дня недели</option>
                    <option value="1">Понедельник</option>
                    <option value="2">Вторник</option>
                    <option value="3">Среда</option>
                    <option value="4">Четверг</option>
                    <option value="5">Пятница</option>
                    <option value="6">Суббота</option>
                    <option value="0">Воскресенье</option>
                  </Select>
                  <Select
                    value={String(task.recurrenceRule.byDay?.[0]?.ordinal ?? 1)}
                    disabled={!task.recurrenceRule.byDay?.[0]}
                    onChange={(e) => updateTask(task.id, {
                      recurrenceRule: {
                        ...task.recurrenceRule!,
                        byDay: task.recurrenceRule?.byDay?.[0]
                          ? [{ ...task.recurrenceRule.byDay[0], ordinal: Number(e.target.value) }]
                          : undefined,
                      },
                    })}
                  >
                    <option value="1">Первый</option>
                    <option value="2">Второй</option>
                    <option value="3">Третий</option>
                    <option value="4">Четвёртый</option>
                    <option value="-1">Последний</option>
                  </Select>
                </div>
                <p className="mt-1 text-[11px] text-muted">Для месячного правила — первый/последний день недели месяца; в годовом правиле укажите BYMONTH, чтобы выбрать конкретные месяцы</p>
              </div>
              {task.recurrenceRule.frequency === "yearly" && (
                <div>
                  <label className="text-xs text-muted">Месяцы года (BYMONTH, 1–12; через запятую)</label>
                  <Input
                    className="w-full"
                    value={(task.recurrenceRule.byMonth ?? []).join(", ")}
                    placeholder="Пусто — любой месяц"
                    onChange={(e) => {
                      const values = e.target.value
                        .split(",")
                        .map((value) => Number(value.trim()))
                        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
                      updateTask(task.id, {
                        recurrenceRule: {
                          ...task.recurrenceRule!,
                          byMonth: values.length ? [...new Set(values)] : undefined,
                        },
                      })
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {(task.recurrenceRule || task.recurrenceParentId) && (
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  updateRecurrenceSeries(task.id, task.recurrenceRule)
                  setTaskId(null)
                }}
              >
                Применить правило ко всей серии
              </Button>
              <p className="mt-1 text-xs text-muted">
                Обновит правило у исходной задачи и будущих активных повторений. Выполненные и пропущенные экземпляры останутся без изменений.
              </p>
            </div>
          )}

          {task.recurrenceRule && (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted">Повторять до (UNTIL; необязательно)</label>
                <Input
                  className="w-full"
                  type="date"
                  value={task.recurrenceRule.until ?? ""}
                  onChange={(e) => updateTask(task.id, {
                    recurrenceRule: {
                      ...task.recurrenceRule!,
                      until: e.target.value || undefined,
                      count: e.target.value ? undefined : task.recurrenceRule?.count,
                    },
                  })}
                />
              </div>
              <div>
                <label className="text-xs text-muted">Количество повторений, включая текущее (COUNT)</label>
                <Input
                  className="w-full"
                  type="number"
                  min={1}
                  max={10000}
                  value={task.recurrenceRule.count ?? ""}
                  placeholder="Без ограничения"
                  onChange={(e) => updateTask(task.id, {
                    recurrenceRule: {
                      ...task.recurrenceRule!,
                      count: e.target.value ? Math.min(10000, Math.max(1, Math.floor(Number(e.target.value) || 1))) : undefined,
                      until: e.target.value ? undefined : task.recurrenceRule?.until,
                    },
                  })}
                />
              </div>
              <div>
                <label className="text-xs text-muted">Исключить даты (EXDATE)</label>
                <Input
                  className="w-full"
                  type="date"
                  value=""
                  onChange={(e) => {
                    const date = e.target.value
                    if (!date) return
                    const excludeDates = [...new Set([...(task.recurrenceRule?.excludeDates ?? []), date])].sort()
                    updateTask(task.id, {
                      recurrenceRule: { ...task.recurrenceRule!, excludeDates },
                    })
                  }}
                />
                {(task.recurrenceRule.excludeDates ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {task.recurrenceRule.excludeDates!.map((date) => (
                      <button
                        key={date}
                        type="button"
                        className="rounded border border-white/10 px-2 py-1 text-xs text-muted hover:text-white"
                        onClick={() => updateTask(task.id, {
                          recurrenceRule: {
                            ...task.recurrenceRule!,
                            excludeDates: task.recurrenceRule?.excludeDates?.filter((item) => item !== date),
                          },
                        })}
                      >
                        {date} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted">Следующая задача создаётся автоматически после завершения текущей. Исключения не удаляют уже созданные экземпляры.</p>
            </div>
          )}
        </div>
        )}

        <div className="space-y-2">
          <label className="text-xs text-muted">Зависит от (сначала нужно выполнить)</label>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
            {tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.archived).map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(task.dependsOn ?? []).includes(item.id)}
                  onChange={(e) => e.target.checked
                    ? addTaskDependency(task.id, item.id)
                    : removeTaskDependency(task.id, item.id)}
                />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.status === "done" ? <span className="text-xs text-emerald-400">Готово</span> : <span className="text-xs text-muted">Не выполнена</span>}
              </label>
            ))}
            {tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.archived).length === 0 && (
              <p className="text-xs text-muted">Пока нет других активных задач</p>
            )}
          </div>
          {dependencyState.isBlocked && (
            <p className="text-xs text-amber-400">
              Заблокирована: {dependencyState.blockedBy.length} незавершённых
              {dependencyState.missingDependencyIds.length > 0 && `, ${dependencyState.missingDependencyIds.length} отсутствующих связей`}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted">Описание</label>
          <Textarea
            value={task.description || ""}
            onChange={(e) => updateTask(task.id, { description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Подзадачи ({children.length})</p>
            <Button size="sm" variant="secondary" onClick={() => {
              const childId = addTask({
                title: "Новая подзадача",
                parentId: task.id,
                projectId: task.projectId,
                projectIds: task.projectIds,
                directionId: task.directionId,
              })
              setTaskId(childId)
            }}>
              + Подзадача
            </Button>
          </div>
          <div className="space-y-1">
            {children.map((child) => (
              <button key={child.id} type="button" className="block w-full truncate text-left text-sm hover:text-teal-300" onClick={() => setTaskId(child.id)}>
                {child.status === "done" ? "✓ " : "○ "}{child.title}
              </button>
            ))}
            {children.length === 0 && <p className="text-xs text-muted">Пока нет подзадач</p>}
          </div>
        </div>

        {task.history && task.history.length > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">История изменений ({task.history.length})</summary>
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
              {[...task.history].reverse().map((entry, index) => (
                <li key={index}>{new Date(entry.at).toLocaleString("ru-RU")} — {entry.change}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button variant="secondary" disabled={Boolean(activeTimer)} onClick={() => {
              startTimer({ taskId: task.id, title: task.title, kind: "focus" })
              setTaskId(null)
            }}>
              {activeTimer ? "Таймер уже запущен" : "Начать фокус"}
            </Button>
            {(task.recurrenceRule || task.repeat) && task.status !== "done" && task.status !== "cancelled" && !task.archived && !task.deletedAt && (
              <Button variant="ghost" onClick={() => {
                if (skipTaskOccurrence(task.id)) setTaskId(null)
              }}>
                Пропустить повторение
              </Button>
            )}
            {task.archived || task.deletedAt ? (
              <Button variant="ghost" onClick={() => { restoreTask(task.id); setTaskId(null) }}>
                Восстановить
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => { archiveTask(task.id); setTaskId(null) }}>
                В архив
              </Button>
            )}
          </div>
          <Button onClick={() => setTaskId(null)}>Закрыть</Button>
        </div>
      </Card>
    </div>
  )
}
