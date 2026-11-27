import { useMemo, useRef, useState, type MouseEvent } from "react"
import { cn } from "@/lib/cn"

export interface ChartPoint {
  label: string
  value: number
}

const W = 640
const H = 220
const PAD_TOP = 26
const PAD_BOTTOM = 14

/** Плавная линия с горизонтальными касательными — без «перелётов» между точками. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ""
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const mx = (p0.x + p1.x) / 2
    d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`
  }
  return d
}

/**
 * Линейный график активности в стиле дашборда-референса:
 * светящаяся линия с рисованием при показе, градиентная заливка, перекрестие и подсказка.
 */
export function ActivityChart({ data, unit = "задач" }: { data: ChartPoint[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const geometry = useMemo(() => {
    const max = Math.max(1, ...data.map((p) => p.value))
    const n = data.length
    const pts = data.map((p, i) => ({
      x: n <= 1 ? W / 2 : (i / (n - 1)) * W,
      y: PAD_TOP + (1 - p.value / max) * (H - PAD_TOP - PAD_BOTTOM),
    }))
    const line = smoothPath(pts)
    const area = pts.length ? `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z` : ""
    return { pts, line, area, max }
  }, [data])

  const active = hover ?? data.length - 1
  const activePoint = geometry.pts[active]
  const activeData = data[active]

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = boxRef.current
    if (!box || data.length === 0) return
    const rect = box.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    setHover(Math.round(ratio * (data.length - 1)))
  }

  if (data.length === 0) return null

  const tooltipLeft = `${(activePoint.x / W) * 100}%`
  const tooltipTop = `${(activePoint.y / H) * 100}%`
  const alignRight = activePoint.x / W > 0.78

  return (
    <div
      ref={boxRef}
      className="relative h-[220px] w-full select-none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={`График: ${data.map((p) => `${p.label} — ${p.value}`).join(", ")}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chart-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="55%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1="0"
            x2={W}
            y1={PAD_TOP + r * (H - PAD_TOP - PAD_BOTTOM)}
            y2={PAD_TOP + r * (H - PAD_TOP - PAD_BOTTOM)}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="2 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={geometry.area} fill="url(#chart-fill)" style={{ animation: "fade-in 1.4s var(--ease-out-expo) 0.3s both" }} />
        <path
          d={geometry.line}
          fill="none"
          stroke="url(#chart-stroke)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1,
            animation: "draw 1.5s var(--ease-out-expo) 0.1s forwards",
            filter: "drop-shadow(0 0 6px var(--color-accent-glow))",
          }}
        />

        <line
          x1={activePoint.x}
          x2={activePoint.x}
          y1={PAD_TOP - 8}
          y2={H}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
          style={{ transition: "all 0.25s var(--ease-out-expo)" }}
        />
      </svg>

      {geometry.pts.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-accent)] bg-[#06100b] transition-all duration-300",
            i === active ? "scale-150 border-white bg-white shadow-[0_0_14px_var(--color-accent-glow)]" : data.length > 16 ? "opacity-0" : "opacity-60",
          )}
          style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
        />
      ))}

      {data.every((p) => p.value === 0) && (
        <p className="pointer-events-none absolute inset-x-0 top-[34%] text-center text-sm text-white/35">
          Пока нет завершённых задач за этот период
        </p>
      )}

      <div
        className={cn(
          "pointer-events-none absolute z-10 -translate-y-[130%] whitespace-nowrap rounded-xl border border-white/10 bg-[rgba(12,18,15,0.92)] px-3 py-1.5 text-xs shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur transition-[left,top] duration-300 ease-[var(--ease-out-expo)]",
          alignRight ? "-translate-x-full" : "-translate-x-1/2",
        )}
        style={{ left: tooltipLeft, top: tooltipTop }}
      >
        <span className="text-white/45">{activeData.label}</span>
        <span className="ml-2 font-medium tabular-nums text-white">
          {activeData.value} {unit}
        </span>
      </div>
    </div>
  )
}
