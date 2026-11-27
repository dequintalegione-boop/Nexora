import type { Priority, TaskStatus, Project } from "@/lib/nexora/types"
import {
  createTaskFilterCondition,
  createTaskFilterGroup,
  isTaskFilterGroup,
  TASK_FILTER_FIELDS,
  TASK_FILTER_OPERATORS,
  type TaskFilterCondition,
  type TaskFilterField,
  type TaskFilterGroup,
} from "@/lib/nexora/task-filters"
import { Button, Input, Select } from "./ui"

type Props = {
  group: TaskFilterGroup
  onChange: (group: TaskFilterGroup) => void
  projects: Project[]
  statusLabels: Record<TaskStatus, string>
  priorityLabels: Record<Priority, string>
}

const DATE_FIELDS: TaskFilterField[] = ["dueDate", "scheduledDate", "createdAt", "updatedAt"]
const NUMBER_FIELDS: TaskFilterField[] = ["estimatedMinutes", "actualMinutes"]

function updateRule(group: TaskFilterGroup, id: string, updater: (rule: TaskFilterCondition | TaskFilterGroup) => TaskFilterCondition | TaskFilterGroup): TaskFilterGroup {
  return {
    ...group,
    rules: group.rules.map((rule) => {
      if (rule.id === id) return updater(rule)
      return isTaskFilterGroup(rule) ? updateRule(rule, id, updater) : rule
    }),
  }
}

function removeRule(group: TaskFilterGroup, id: string): TaskFilterGroup {
  return {
    ...group,
    rules: group.rules
      .filter((rule) => rule.id !== id)
      .map((rule) => isTaskFilterGroup(rule) ? removeRule(rule, id) : rule),
  }
}

function RuleEditor({
  group, onChange, projects, statusLabels, priorityLabels, depth = 0,
}: Props & { depth?: number }) {
  const update = (id: string, updater: (rule: TaskFilterCondition | TaskFilterGroup) => TaskFilterCondition | TaskFilterGroup) =>
    onChange(updateRule(group, id, updater))
  const remove = (id: string) => onChange(removeRule(group, id))

  return (
    <div className={depth ? "ml-3 border-l border-white/10 pl-3" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Совпадают</span>
        <Select aria-label="Логика условий" value={group.conjunction} onChange={(event) => onChange({ ...group, conjunction: event.target.value as "and" | "or" })}>
          <option value="and">Все условия (И)</option>
          <option value="or">Любое условие (ИЛИ)</option>
        </Select>
        {depth < 3 && <Button size="sm" variant="ghost" onClick={() => onChange({ ...group, rules: [...group.rules, createTaskFilterGroup()] })}>+ Группа</Button>}
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...group, rules: [...group.rules, createTaskFilterCondition()] })}>+ Условие</Button>
        {depth > 0 && <Button size="sm" variant="ghost" onClick={() => onChange({ ...group, rules: [] })}>Очистить группу</Button>}
      </div>
      {group.rules.map((rule) => isTaskFilterGroup(rule) ? (
        <div key={rule.id} className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => remove(rule.id)}>Удалить группу</Button>
          </div>
          <RuleEditor group={rule} onChange={(next) => update(rule.id, () => next)} projects={projects} statusLabels={statusLabels} priorityLabels={priorityLabels} depth={depth + 1} />
        </div>
      ) : (
        <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2">
          <Select aria-label="Поле фильтра" value={rule.field} onChange={(event) => update(rule.id, (current) => ({ ...current, field: event.target.value as TaskFilterField, operator: "equals", value: "" }))}>
            {TASK_FILTER_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
          </Select>
          <Select aria-label="Оператор фильтра" value={rule.operator} onChange={(event) => update(rule.id, (current) => ({ ...current, operator: event.target.value as TaskFilterCondition["operator"] }))}>
            {TASK_FILTER_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
          </Select>
          {!["isEmpty", "isNotEmpty"].includes(rule.operator) && (
            <>
              {rule.field === "status" ? (
                <Select aria-label="Значение статуса" value={rule.value ?? ""} onChange={(event) => update(rule.id, (current) => ({ ...current, value: event.target.value }))}>
                  {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              ) : rule.field === "priority" ? (
                <Select aria-label="Значение приоритета" value={rule.value ?? ""} onChange={(event) => update(rule.id, (current) => ({ ...current, value: event.target.value }))}>
                  {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              ) : rule.field === "projectId" ? (
                <Select aria-label="Проект" value={rule.value ?? ""} onChange={(event) => update(rule.id, (current) => ({ ...current, value: event.target.value }))}>
                  <option value="">Выберите проект</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </Select>
              ) : rule.field === "blocked" ? (
                <Select aria-label="Состояние блокировки" value={rule.value ?? "true"} onChange={(event) => update(rule.id, (current) => ({ ...current, value: event.target.value }))}>
                  <option value="true">Да</option><option value="false">Нет</option>
                </Select>
              ) : (
                <Input
                  aria-label="Значение фильтра"
                  type={DATE_FIELDS.includes(rule.field) ? "date" : NUMBER_FIELDS.includes(rule.field) ? "number" : "text"}
                  value={rule.value ?? ""}
                  placeholder="Значение"
                  className="min-w-28 flex-1"
                  onChange={(event) => update(rule.id, (current) => ({ ...current, value: event.target.value }))}
                />
              )}
              {rule.operator === "between" && (
                <Input aria-label="Верхняя граница" type={NUMBER_FIELDS.includes(rule.field) ? "number" : "date"} value={rule.secondValue ?? ""} onChange={(event) => update(rule.id, (current) => ({ ...current, secondValue: event.target.value }))} />
              )}
            </>
          )}
          <Button size="sm" variant="ghost" aria-label="Удалить условие" onClick={() => remove(rule.id)}>×</Button>
        </div>
      ))}
      {group.rules.length === 0 && <p className="py-2 text-xs text-muted">Условия не добавлены — фильтр не ограничивает список.</p>}
    </div>
  )
}

export function TaskFilterBuilder(props: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div>
        <h3 className="text-sm font-semibold">Расширенный фильтр</h3>
        <p className="text-xs text-muted">Объединяйте условия через И/ИЛИ и создавайте вложенные группы.</p>
      </div>
      <RuleEditor {...props} />
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => props.onChange(createTaskFilterGroup())}>Сбросить фильтр</Button>
      </div>
    </div>
  )
}
