import { useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { isoDate } from "@/lib/nexora/dates"
import { Button, Card, Input, Textarea } from "./ui"

export function JournalPage() {
  const entries = useNexora((s) => s.entries)
  const upsertEntry = useNexora((s) => s.upsertEntry)
  const today = isoDate()
  const entry = entries.find((e) => e.date === today)

  const [mood, setMood] = useState(entry?.mood?.toString() ?? "")
  const [energy, setEnergy] = useState(entry?.energy?.toString() ?? "")
  const [gratitude, setGratitude] = useState(entry?.gratitude ?? "")
  const [wins, setWins] = useState(entry?.wins ?? "")
  const [thoughts, setThoughts] = useState(entry?.thoughts ?? "")

  const save = () => {
    upsertEntry(today, {
      mood: mood ? Number(mood) : undefined,
      energy: energy ? Number(energy) : undefined,
      gratitude: gratitude || undefined,
      wins: wins || undefined,
      thoughts: thoughts || undefined,
    })
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Ежедневник — {today}</h1>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted">Настроение (1–10)</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={mood}
              onChange={(e) => setMood(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-muted">Энергия (1–10)</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={energy}
              onChange={(e) => setEnergy(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">Благодарность</label>
          <Textarea value={gratitude} onChange={(e) => setGratitude(e.target.value)} rows={2} />
        </div>

        <div>
          <label className="text-sm text-muted">Успехи дня</label>
          <Textarea value={wins} onChange={(e) => setWins(e.target.value)} rows={2} />
        </div>

        <div>
          <label className="text-sm text-muted">Мысли / заметки</label>
          <Textarea value={thoughts} onChange={(e) => setThoughts(e.target.value)} rows={4} />
        </div>

        <Button onClick={save}>Сохранить</Button>
      </Card>
    </div>
  )
}
