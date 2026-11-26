import { useEffect, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import type { SessionKind } from "@/lib/nexora/types"
import { Button, Card } from "./ui"

export function TimerPage() {
  const activeTimer = useNexora((s) => s.activeTimer)
  // simplistic local timer for now
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [kind, setKind] = useState<SessionKind>("focus")

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-semibold">Таймер</h1>

      <Card className="p-8 space-y-6">
        <div className="text-6xl font-mono tabular-nums">{display}</div>

        <div className="flex justify-center gap-2">
          {(["focus", "break", "free"] as SessionKind[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kind === k ? "primary" : "secondary"}
              onClick={() => setKind(k)}
            >
              {k === "focus" ? "Фокус" : k === "break" ? "Перерыв" : "Свободный"}
            </Button>
          ))}
        </div>

        <div className="flex justify-center gap-3">
          {!running ? (
            <Button onClick={() => setRunning(true)}>Старт</Button>
          ) : (
            <Button variant="secondary" onClick={() => setRunning(false)}>Пауза</Button>
          )}
          <Button variant="ghost" onClick={() => { setRunning(false); setSeconds(0) }}>Сброс</Button>
        </div>
      </Card>
    </div>
  )
}
