import { useEffect, useRef, useState } from "react"

/** true, если пользователь просит уменьшить анимацию */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

/**
 * Плавно «докручивает» число до нового значения (как счётчик в примере).
 * При первом показе стартует с 0, при изменении — с текущего значения.
 */
export function useCountUp(target: number, duration = 1100): number {
  const safe = Number.isFinite(target) ? target : 0
  const [value, setValue] = useState(prefersReducedMotion() ? safe : 0)
  const fromRef = useRef(value)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(safe)
      fromRef.current = safe
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const next = from + (safe - from) * easeOutExpo(t)
      setValue(next)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = safe
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [safe, duration])

  return Math.round(value)
}

/** Появление элемента снизу с лёгким fade (для карточек дашборда). */
export function useEnterAnimation(delayMs = 0): React.CSSProperties {
  const [shown, setShown] = useState(prefersReducedMotion())
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = window.setTimeout(() => setShown(true), delayMs)
    return () => window.clearTimeout(id)
  }, [delayMs])
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(10px)",
    transition: prefersReducedMotion()
      ? undefined
      : `opacity 420ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms, transform 420ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
  }
}
