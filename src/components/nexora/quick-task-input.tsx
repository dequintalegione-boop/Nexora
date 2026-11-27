import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

export type QuickSuggestKind = "tag" | "context" | "project" | "priority" | "status"

export interface QuickSuggestItem {
  kind: QuickSuggestKind
  /** Token without trigger, e.g. "работа" or "высокий" */
  value: string
  /** Full insert text including trigger, e.g. "#работа" */
  insert: string
  label: string
  hint?: string
}

interface QuickTaskInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  className?: string
  suggestions: QuickSuggestItem[]
  disabled?: boolean
}

function detectTrigger(text: string, cursor: number): { trigger: string; query: string; start: number } | null {
  if (cursor <= 0) return null
  const before = text.slice(0, cursor)
  const match = /(?:^|[\s])([#@+!*])([\p{L}\p{N}_-]*)$/u.exec(before)
  if (!match) return null
  const trigger = match[1]
  const query = match[2] ?? ""
  const start = before.length - trigger.length - query.length
  return { trigger, query, start }
}

const KIND_LABEL: Record<QuickSuggestKind, string> = {
  tag: "метка",
  context: "контекст",
  project: "проект",
  priority: "приоритет",
  status: "статус",
}

export function QuickTaskInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  suggestions,
  disabled,
}: QuickTaskInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const triggerState = useMemo(() => detectTrigger(value, cursor), [value, cursor])

  const filtered = useMemo(() => {
    if (!triggerState) return []
    const { trigger, query } = triggerState
    const kindMap: Record<string, QuickSuggestKind> = {
      "#": "tag",
      "@": "context",
      "+": "project",
      "!": "priority",
      "*": "status",
    }
    const kind = kindMap[trigger]
    if (!kind) return []
    const q = query.toLocaleLowerCase("ru-RU")
    return suggestions
      .filter((s) => s.kind === kind)
      .filter((s) => !q || s.value.toLocaleLowerCase("ru-RU").includes(q) || s.label.toLocaleLowerCase("ru-RU").includes(q))
      .slice(0, 8)
  }, [triggerState, suggestions])

  useEffect(() => {
    setOpen(filtered.length > 0)
    setActiveIndex(0)
  }, [filtered])

  const applyItem = (item: QuickSuggestItem) => {
    if (!triggerState || !inputRef.current) return
    const { start } = triggerState
    const end = cursor
    const next = `${value.slice(0, start)}${item.insert} ${value.slice(end)}`.replace(/\s{2,}/g, " ")
    onChange(next.trimStart())
    setOpen(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = start + item.insert.length + 1
      el.focus()
      el.setSelectionRange(pos, pos)
      setCursor(pos)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        applyItem(filtered[activeIndex] ?? filtered[0])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
        return
      }
    }
    if (e.key === "Enter" && !open) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative min-w-[200px] flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={`field w-full ${className ?? ""}`}
        onChange={(e) => {
          onChange(e.target.value)
          setCursor(e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => setCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
        onKeyUp={(e) => setCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/15 bg-[#12161c] py-1 shadow-xl"
          role="listbox"
        >
          {filtered.map((item, index) => (
            <li key={`${item.kind}-${item.insert}`}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  index === activeIndex ? "bg-teal-400/15 text-teal-100" : "text-foreground/90 hover:bg-white/5"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applyItem(item)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="font-medium">{item.insert}</span>
                <span className="truncate text-xs text-muted">{item.label !== item.value ? item.label : KIND_LABEL[item.kind]}</span>
                {item.hint && <span className="ml-auto text-[10px] text-muted">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Build suggestion list from app data. */
export function buildQuickTaskSuggestions(args: {
  tags: string[]
  contexts: string[]
  projects: { id: string; title: string }[]
  priorities: { id: string; label: string }[]
  statuses: { id: string; label: string }[]
}): QuickSuggestItem[] {
  const items: QuickSuggestItem[] = []
  for (const tag of args.tags) {
    items.push({ kind: "tag", value: tag, insert: `#${tag}`, label: tag, hint: "метка" })
  }
  for (const ctx of args.contexts) {
    items.push({ kind: "context", value: ctx, insert: `@${ctx}`, label: ctx, hint: "контекст" })
  }
  for (const p of args.projects) {
    items.push({ kind: "project", value: p.title, insert: `+${p.title}`, label: p.title, hint: "проект" })
  }
  const priorityToken: Record<string, string> = {
    none: "нет",
    low: "низкий",
    medium: "средний",
    high: "высокий",
    critical: "критический",
  }
  for (const p of args.priorities) {
    const token = priorityToken[p.id] ?? p.label.toLocaleLowerCase("ru-RU").replace(/\s+/g, "")
    items.push({ kind: "priority", value: p.label, insert: `!${token}`, label: p.label, hint: p.id })
  }
  for (const s of args.statuses) {
    const token = s.id.replace(/[^a-z0-9а-яё_]+/gi, "_")
    items.push({ kind: "status", value: s.id, insert: `*${token}`, label: s.label, hint: s.id })
  }
  return items
}
