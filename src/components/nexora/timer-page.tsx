import { useEffect, useState } from "react"
import { Clock3, Pause, Play, Square, Pencil, Check, X } from "lucide-react"
import { useNexora } from "@/lib/nexora/store"
import { Button, Card, Input } from "./ui"
import type { PomodoroSettings, SessionKind } from "@/lib/nexora/types"
import { normalizePomodoroSettings } from "@/lib/nexora/pomodoro"

const KIND_LABEL: Record<SessionKind, string> = {
  focus: "Фокус",
  break: "Перерыв",
  free: "Свободная сессия",
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function phaseLabel(phase: "focus" | "short_break" | "long_break") {
  if (phase === "focus") return "Фокус"
  return phase === "long_break" ? "Длинный перерыв" : "Короткий перерыв"
}

type SessionEditor = {
  id: string
  title: string
  startedAt: string
  endedAt: string
}

export function TimerPage() {
  const activeTimer = useNexora((state) => state.activeTimer)
  const sessions = useNexora((state) => state.sessions)
  const settings = useNexora((state) => state.settings)
  const updateSettings = useNexora((state) => state.updateSettings)
  const startTimer = useNexora((state) => state.startTimer)
  const startPomodoro = useNexora((state) => state.startPomodoro)
  const advancePomodoro = useNexora((state) => state.advancePomodoro)
  const updateTimeSession = useNexora((state) => state.updateTimeSession)
  const pauseTimer = useNexora((state) => state.pauseTimer)
  const resumeTimer = useNexora((state) => state.resumeTimer)
  const stopTimer = useNexora((state) => state.stopTimer)
  const [kind, setKind] = useState<SessionKind>("focus")
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">("stopwatch")
  const [now, setNow] = useState(() => Date.now())
  const [editor, setEditor] = useState<SessionEditor | null>(null)
  const [editorError, setEditorError] = useState("")

  const pomodoroSettings = normalizePomodoroSettings(settings.pomodoro)
  const updatePomodoro = (patch: Partial<PomodoroSettings>) => {
    updateSettings({
      pomodoro: normalizePomodoroSettings({ ...pomodoroSettings, ...patch }),
    })
  }

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [activeTimer?.startedAt, activeTimer?.pausedAt])

  const elapsedMs = activeTimer
    ? Math.max(
        0,
        (activeTimer.accumulatedMs ?? 0) +
          (activeTimer.pausedAt ? 0 : now - new Date(activeTimer.startedAt).getTime())
      )
    : 0
  const pomodoro = activeTimer?.pomodoro
  const remainingMs = pomodoro ? Math.max(0, pomodoro.phaseDurationMs - elapsedMs) : 0
  const displayTime = pomodoro ? remainingMs : elapsedMs
  const phaseCompleted = Boolean(pomodoro && remainingMs === 0)

  useEffect(() => {
    if (!pomodoro || activeTimer?.pausedAt || !activeTimer) return
    if (elapsedMs >= pomodoro.phaseDurationMs) advancePomodoro()
  }, [pomodoro?.phase, pomodoro?.phaseDurationMs, activeTimer?.startedAt, activeTimer?.pausedAt, elapsedMs, advancePomodoro])

  const handleStart = () => {
    if (mode === "pomodoro") startPomodoro()
    else startTimer({ kind, title: KIND_LABEL[kind] })
    setNow(Date.now())
  }

  const handleStop = () => {
    stopTimer()
    setNow(Date.now())
  }

  const saveSessionCorrection = () => {
    if (!editor) return
    const start = new Date(editor.startedAt)
    const end = new Date(editor.endedAt)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setEditorError("Время окончания должно быть позже времени начала.")
      return
    }
    const saved = updateTimeSession(editor.id, {
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      title: editor.title,
    })
    if (!saved) {
      setEditorError("Не удалось сохранить исправление. Проверьте время начала и окончания.")
      return
    }
    setEditor(null)
    setEditorError("")
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400">
          <Clock3 size={24} />
        </div>
        <h1 className="text-2xl font-semibold">Таймер</h1>
        <p className="text-sm text-muted">
          Активная сессия сохраняется автоматически и восстанавливается после перезагрузки.
        </p>
      </header>

      {!activeTimer && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant={mode === "stopwatch" ? "primary" : "secondary"} onClick={() => setMode("stopwatch")}>
            Секундомер
          </Button>
          <Button size="sm" variant={mode === "pomodoro" ? "primary" : "secondary"} onClick={() => setMode("pomodoro")}>
            Pomodoro
          </Button>
        </div>
      )}

      <Card className="space-y-6 p-6 text-center sm:p-8">
        <div className="text-6xl font-mono font-semibold tabular-nums tracking-tight sm:text-7xl">
          {formatDuration(displayTime)}
        </div>
        <p className="text-sm text-muted">
          {pomodoro
            ? "Pomodoro · " + phaseLabel(pomodoro.phase) + " · цикл " +
              pomodoro.completedFocusCycles + "/" + pomodoro.cyclesBeforeLongBreak +
              (phaseCompleted ? " · этап завершён" : "")
            : activeTimer
              ? KIND_LABEL[activeTimer.kind] + " · " + (activeTimer.pausedAt ? "на паузе" : "идёт")
              : mode === "pomodoro" ? "Готов к циклу Pomodoro" : "Готов к новой сессии"}
        </p>

        {!activeTimer && mode === "stopwatch" && (
          <div className="flex flex-wrap justify-center gap-2">
            {(["focus", "break", "free"] as SessionKind[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={kind === value ? "primary" : "secondary"}
                onClick={() => setKind(value)}
              >
                {KIND_LABEL[value]}
              </Button>
            ))}
          </div>
        )}

        {!activeTimer ? (
          <Button onClick={handleStart}>
            <span className="inline-flex items-center gap-2"><Play size={16} />{mode === "pomodoro" ? "Начать Pomodoro" : "Начать"}</span>
          </Button>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="secondary"
              disabled={phaseCompleted}
              onClick={() => {
                if (activeTimer.pausedAt) resumeTimer()
                else pauseTimer()
                setNow(Date.now())
              }}
            >
              <span className="inline-flex items-center gap-2">
                {activeTimer.pausedAt ? <Play size={16} /> : <Pause size={16} />}
                {activeTimer.pausedAt ? "Продолжить" : "Пауза"}
              </span>
            </Button>
            {pomodoro && (
              <Button variant="secondary" onClick={() => advancePomodoro(true)}>
                {phaseCompleted ? "Следующий этап" : "Пропустить этап"}
              </Button>
            )}
            <Button onClick={handleStop}>
              <span className="inline-flex items-center gap-2"><Square size={15} />Завершить и сохранить</span>
            </Button>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-medium">Настройки Pomodoro</h2>
          <p className="mt-1 text-xs text-muted">Настройки сохраняются в профиле и входят в JSON-бэкап.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="space-y-1 text-left text-xs text-muted">
            Фокус, мин
            <Input type="number" min={1} max={180} value={pomodoroSettings.focusMinutes}
              onChange={(event) => updatePomodoro({ focusMinutes: Number(event.target.value) })} />
          </label>
          <label className="space-y-1 text-left text-xs text-muted">
            Короткий перерыв
            <Input type="number" min={1} max={60} value={pomodoroSettings.shortBreakMinutes}
              onChange={(event) => updatePomodoro({ shortBreakMinutes: Number(event.target.value) })} />
          </label>
          <label className="space-y-1 text-left text-xs text-muted">
            Длинный перерыв
            <Input type="number" min={1} max={90} value={pomodoroSettings.longBreakMinutes}
              onChange={(event) => updatePomodoro({ longBreakMinutes: Number(event.target.value) })} />
          </label>
          <label className="space-y-1 text-left text-xs text-muted">
            Циклов до длинного
            <Input type="number" min={2} max={12} value={pomodoroSettings.cyclesBeforeLongBreak}
              onChange={(event) => updatePomodoro({ cyclesBeforeLongBreak: Number(event.target.value) })} />
          </label>
        </div>
        <Button size="sm" variant="secondary" onClick={() => updatePomodoro({ autoStartNext: !pomodoroSettings.autoStartNext })}>
          Автозапуск следующего этапа: {pomodoroSettings.autoStartNext ? "включён" : "выключен"}
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">История сессий</h2>
          <span className="text-xs text-muted">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">Завершённых сессий пока нет.</p>
        ) : (
          <div className="space-y-3">
            {sessions.slice(0, 10).map((session) => (
              <div key={session.id} className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
                {editor?.id === session.id ? (
                  <div className="space-y-2">
                    <Input value={editor.title} placeholder="Название сессии"
                      onChange={(event) => setEditor({ ...editor, title: event.target.value })} />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-left text-xs text-muted">
                        Начало
                        <Input type="datetime-local" value={editor.startedAt}
                          onChange={(event) => setEditor({ ...editor, startedAt: event.target.value })} />
                      </label>
                      <label className="space-y-1 text-left text-xs text-muted">
                        Окончание
                        <Input type="datetime-local" value={editor.endedAt}
                          onChange={(event) => setEditor({ ...editor, endedAt: event.target.value })} />
                      </label>
                    </div>
                    {editorError && <p role="alert" className="text-xs text-red-400">{editorError}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveSessionCorrection}><Check size={14} />Сохранить</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditor(null); setEditorError("") }}><X size={14} />Отмена</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{session.title || KIND_LABEL[session.kind]}</p>
                      <p className="text-xs text-muted">
                        {new Date(session.startedAt).toLocaleString("ru-RU")} · {KIND_LABEL[session.kind]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums text-teal-400">{session.durationMinutes ?? 0} мин</span>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditor({
                          id: session.id,
                          title: session.title ?? "",
                          startedAt: toLocalDateTimeInput(session.startedAt),
                          endedAt: toLocalDateTimeInput(session.endedAt),
                        })
                        setEditorError("")
                      }}>
                        <Pencil size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
