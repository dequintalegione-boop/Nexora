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
      fromRef.current = next
      setValue(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [safe, duration])

  return value
}

/** Включает класс .is-visible у элементов [data-reveal] внутри контейнера, когда они попадают в экран. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"))
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      items.forEach((el) => el.classList.add("is-visible"))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12 },
    )
    items.forEach((el, i) => {
      el.style.setProperty("--reveal-delay", `${Math.min(i, 8) * 60}ms`)
      io.observe(el)
    })
    return () => io.disconnect()
  })

  return ref
}
