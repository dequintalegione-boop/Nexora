import {
  forwardRef,
  useCallback,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { cn } from "@/lib/cn"

type CardProps = { className?: string; children: ReactNode; lift?: boolean } & HTMLAttributes<HTMLDivElement>

/** Стеклянная карточка. Подсветка следует за курсором через --mx/--my. */
export function Card({ className, children, lift, onMouseMove, ...props }: CardProps) {
  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const el = event.currentTarget
      const rect = el.getBoundingClientRect()
      el.style.setProperty("--mx", `${event.clientX - rect.left}px`)
      el.style.setProperty("--my", `${event.clientY - rect.top}px`)
      onMouseMove?.(event)
    },
    [onMouseMove],
  )

  return (
    <div className={cn("halo-card", lift && "halo-card--lift", className)} onMouseMove={handleMove} {...props}>
      {children}
    </div>
  )
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }
>(({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
  const variants = {
    primary:
      "bg-[var(--color-accent)] text-[#04120b] font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset,0_8px_24px_-8px_var(--color-accent-glow)] hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.25)_inset,0_10px_30px_-6px_var(--color-accent-glow)]",
    secondary:
      "bg-white/[0.06] text-white border border-white/10 hover:bg-white/[0.1] hover:border-white/20",
    ghost: "text-white/75 hover:bg-white/[0.07] hover:text-white",
  }
  const sizes = {
    sm: "px-3 py-1 text-[13px]",
    md: "px-4 py-2 text-sm",
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "pressable rounded-full font-medium disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})
Button.displayName = "Button"

const fieldBase =
  "rounded-xl border border-white/[0.09] bg-white/[0.035] text-sm text-white outline-none placeholder:text-white/30 transition-[border-color,background,box-shadow] duration-300 hover:border-white/[0.16] focus:border-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_var(--color-accent-soft)]"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, "px-3.5 py-2", className)} {...props} />,
)
Input.displayName = "Input"

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "w-full resize-y px-3.5 py-2.5", className)} {...props} />
  ),
)
Textarea.displayName = "Textarea"

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(fieldBase, "px-3 py-2", className)} {...props} />,
)
Select.displayName = "Select"

export function Badge({ children, priority, className }: { children: ReactNode; priority?: string; className?: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500/15 text-red-300 ring-red-400/25",
    high: "bg-orange-500/15 text-orange-300 ring-orange-400/25",
    medium: "bg-yellow-500/15 text-yellow-200 ring-yellow-300/20",
    low: "bg-sky-500/15 text-sky-300 ring-sky-400/25",
    none: "bg-white/[0.06] text-white/60 ring-white/10",
  }
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset", colors[priority || "none"] ?? colors.none, className)}>
      {children}
    </span>
  )
}

export function PageHeader({
  kicker,
  title,
  text,
  children,
}: {
  kicker?: string
  title: string
  text?: string
  children?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {kicker && <p className="eyebrow mb-2">{kicker}</p>}
        <h1 className="text-[28px] font-medium tracking-tight md:text-[34px]">{title}</h1>
        {text && <p className="mt-1.5 max-w-2xl text-sm text-muted">{text}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </header>
  )
}

/** Тонкая полоска прогресса со светящимся концом. */
export function Meter({ value, className }: { value: number; className?: string }) {
  const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
    >
      <div
        className="progress-fill h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-accent)_55%,transparent),var(--color-accent))] shadow-[0_0_12px_var(--color-accent-glow)]"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  )
}

/** Сегментная полоска (n делений, заполнено round(value%)). */
export function SegBar({ value, segments = 24, accent = true }: { value: number; segments?: number; accent?: boolean }) {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const filled = Math.round((safe / 100) * segments)
  return (
    <div
      className={cn("segbar", accent && "accent")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
    >
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < filled ? "on" : undefined} style={{ transitionDelay: `${i * 14}ms` }} />
      ))}
    </div>
  )
}

/** Кольцо прогресса с рисками по окружности (как «Staking» в примере). */
export function Ring({
  value,
  size = 168,
  label,
  caption,
}: {
  value: number
  size?: number
  label?: ReactNode
  caption?: string
}) {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const ticks = 60
  const r = size / 2 - 10
  const c = size / 2
  const filled = Math.round((safe / 100) * ticks)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * Math.PI * 2 - Math.PI / 2
          const on = i < filled
          const inner = r - (on ? 9 : 6)
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * inner}
              y1={c + Math.sin(a) * inner}
              x2={c + Math.cos(a) * r}
              y2={c + Math.sin(a) * r}
              strokeLinecap="round"
              strokeWidth={on ? 2.4 : 1.6}
              stroke={on ? "var(--color-accent)" : "rgba(255,255,255,0.12)"}
              style={{
                transition: `stroke 0.4s ${i * 12}ms, stroke-width 0.4s ${i * 12}ms`,
                filter: on ? "drop-shadow(0 0 3px var(--color-accent-glow))" : undefined,
              }}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[34px] font-medium leading-none tracking-tight">{label ?? `${Math.round(safe)}%`}</div>
        {caption && <div className="mt-1.5 text-xs text-muted">{caption}</div>}
      </div>
    </div>
  )
}
