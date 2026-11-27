import type { TimeSession } from "./types"

export type TimeSessionCorrection = Pick<Partial<TimeSession>, "startedAt" | "endedAt" | "title">

export interface CorrectedTimeSessionResult {
  sessions: TimeSession[]
  previous: TimeSession
  updated: TimeSession
}

/** Corrects a completed session without mutating the source array. */
export function correctTimeSession(
  sessions: TimeSession[],
  sessionId: string,
  patch: TimeSessionCorrection,
  updatedAt: string,
): CorrectedTimeSessionResult | null {
  const previous = sessions.find((session) => session.id === sessionId)
  if (!previous) return null

  const startedAt = patch.startedAt ?? previous.startedAt
  const endedAt = patch.endedAt ?? previous.endedAt
  const startMs = Date.parse(startedAt)
  const endMs = Date.parse(endedAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null

  const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000))
  const updated: TimeSession = {
    ...previous,
    startedAt,
    endedAt,
    durationMinutes,
    title: patch.title === undefined ? previous.title : patch.title.trim() || undefined,
    updatedAt,
  }
  return {
    sessions: sessions.map((session) => session.id === sessionId ? updated : session),
    previous,
    updated,
  }
}
