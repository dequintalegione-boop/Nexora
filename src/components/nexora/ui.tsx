import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm", className)} {...props}>
      {children}
    </div>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "bg-teal-500 hover:bg-teal-400 text-black",
      secondary: "bg-white/10 hover:bg-white/15 text-white",
      ghost: "hover:bg-white/10 text-white/80",
    }
    const sizes = {
      sm: "px-2.5 py-1 text-sm",
      md: "px-3.5 py-1.5",
    }
    return (
      <button
        ref={ref}
        className={cn("rounded-lg font-medium transition disabled:opacity-50", variants[variant], sizes[size], className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn("rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-teal-500/50", className)}
    {...props}
  />
))
Input.displayName = "Input"

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn("w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500/50 resize-y", className)}
    {...props}
  />
))
Textarea.displayName = "Textarea"

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-teal-500/50", className)}
    {...props}
  />
))
Select.displayName = "Select"

export function Badge({ children, priority, className }: { children: ReactNode; priority?: string; className?: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300",
    high: "bg-orange-500/20 text-orange-300",
    medium: "bg-yellow-500/20 text-yellow-300",
    low: "bg-blue-500/20 text-blue-300",
    none: "bg-white/10 text-white/60",
  }
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full", colors[priority || "none"], className)}>
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
    <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {kicker && <p className="mb-1 text-xs font-medium uppercase tracking-wider text-dim">{kicker}</p>}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {text && <p className="mt-1 max-w-2xl text-sm text-muted">{text}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </header>
  )
}

export function Meter({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-white/10", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
    >
      <div
        className="h-full rounded-full bg-teal-400 transition-[width] duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  )
}
