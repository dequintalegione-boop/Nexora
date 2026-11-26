import { useEffect, useState } from "react"
import { Clock3, Pause, Play, RotateCcw, Square } from "lucide-react"
import { useNexora } from "@/lib/nexora/store"
import type { SessionKind } from "@/lib/nexora/types"
import { Button, Card } from "./ui"

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

export function TimerPage() {
  const activeTimer = useNexora((state) => state.activeTimer)
  const sessions = useNexora((state) => state.sessions)
  const startTimer = useNexora((state) => state.startTimer)
  const pauseTimer = useNexora((state) => state.pauseTimer)
  const resumeTimer = useNexora((state) => state.resumeTimer)
  const stopTimer = useNexora((state) => state.stopTimer)
  const [kind, setKind] = useState<SessionKind>("focus")
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [activeTimer?.startedAt, activeTimer?.pausedAt, activeTimer])

  const elapsedMs = activeTimer
    ? Math.max(
        0,
        (activeTimer.accumulatedMs ?? 0) +
          (activeTimer.pausedAt ? 0 : now - new Date(activeTimer.startedAt).getTime())
      )
    : 0

  const handleStart = () => {
    startTimer({ kind, title: KIND_LABEL[kind] })
    setNow(Date.now())
  }

  const handleStop = () => {
    stopTimer()
    setNow(Date.now())
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400">
          <Clock3 size={24} />
        </div>
        <h1 className="text-2xl font-semibold">Таймер</h1>
        <p className="text-sm text-muted">
          Время сохраняется автоматически и не сбрасывается при перезагрузке страницы.
        </p>
      </header>

      <Card className="space-y-6 p-6 text-center sm:p-8">
        <div className="text-6xl font-mono font-semibold tabular-nums tracking-tight sm:text-7xl">
          {formatDuration(elapsedMs)}
        </div>
        <p className="text-sm text-muted">
          {activeTimer
            ? `${KIND_LABEL[activeTimer.kind]} · ${activeTimer.pausedAt ? "на паузе" : "идёт"}`
            : "Готов к новой сессии"}
        </p>

        {!activeTimer && (
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

        <div className="flex flex-wrap justify-center gap-3">
          {!activeTimer ? (
            <Button onClick={handleStart}>
              <span className="inline-flex items-center gap-2"><Play size={16} />Начать</span>
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
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
              <Button onClick={handleStop}>
                <span className="inline-flex items-center gap-2"><Square size={15} />Завершить</span>
              </Button>
            </>
          )}
          {activeTimer && (
            <Button variant="ghost" onClick={handleStop}>
              <span className="inline-flex items-center gap-2"><RotateCcw size={15} />Завершить и сохранить</span>
            </Button>
          )}
        </div>
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
              <div key={session.id} className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{session.title || KIND_LABEL[session.kind]}</p>
                  <p className="text-xs text-muted">
                    {new Date(session.startedAt).toLocaleString("ru-RU")}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-teal-400">
                  {session.durationMinutes ?? 0} мин
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
