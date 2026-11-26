import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

export function Calendar() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selected, setSelected] = useState(keyOf(new Date()))
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const settings = useLiveQuery(() => db.settings.get('settings'), [])\n  const weekStartsOn = settings?.weekStartsOn ?? 1\n  const weekdays = weekStartsOn === 1 ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']\n  const habits = useLiveQuery(() => db.habits.filter(h => h.active && !h.archived).toArray(), [])
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() - weekStartsOn + 7) % 7
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
      const date = new Date(month.getFullYear(), month.getMonth(), i - offset + 1)
      return { date, inMonth: date.getMonth() === month.getMonth(), key: keyOf(date) }
    })
  }, [month, weekStartsOn])
  const dayTasks = (tasks ?? []).filter(t => !t.archived && (t.scheduledDate?.slice(0, 10) === selected || t.dueDate?.slice(0, 10) === selected))
  const monthLabel = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="animate-in"><div className="mb-1.5 flex items-center gap-2"><CalendarDays size={14} className="text-[var(--color-accent)]"/><span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">Планирование</span></div><h1 className="text-[28px] font-semibold">Календарь</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">Задачи по датам и ежедневный план.</p></div>
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <section className="glass-static p-4 sm:p-5"><div className="mb-5 flex items-center justify-between"><button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="pressable rounded-xl p-2 hover:bg-white/[0.06]" aria-label="Предыдущий месяц"><ChevronLeft size={18}/></button><h2 className="text-base font-medium capitalize">{monthLabel}</h2><button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="pressable rounded-xl p-2 hover:bg-white/[0.06]" aria-label="Следующий месяц"><ChevronRight size={18}/></button></div>
      <div className="mb-2 grid grid-cols-7 text-center text-xs text-[var(--color-text-dim)]">{weekdays.map(d => <div key={d} className="py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{days.map(({date,inMonth,key}) => { const count=(tasks ?? []).filter(t=>!t.archived && (t.scheduledDate?.slice(0,10)===key || t.dueDate?.slice(0,10)===key)).length; return <button key={key} onClick={()=>setSelected(key)} className={'relative flex min-h-12 flex-col items-center justify-center rounded-xl text-sm transition-colors '+(selected===key?'bg-[var(--color-accent)] text-[#04120f]':inMonth?'hover:bg-white/[0.07]':'text-[var(--color-text-dim)] opacity-40')}><span>{date.getDate()}</span>{count>0 && <span className={'mt-1 h-1 w-1 rounded-full '+(selected===key?'bg-[#04120f]':'bg-[var(--color-accent)]')}/>}</button>})}</div>
      <button onClick={()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelected(keyOf(d))}} className="mt-4 text-xs text-[var(--color-accent)]">Перейти к сегодня</button></section>
      <section className="glass-static p-5"><h2 className="mb-1 text-sm font-medium">{new Date(selected+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}</h2><p className="mb-4 text-xs text-[var(--color-text-dim)]">Задачи на выбранный день</p>
        {dayTasks.length ? <div className="space-y-3">{dayTasks.map(t=><div key={t.id} className="border-b border-[var(--color-border)] pb-3 last:border-0"><p className="text-sm font-medium">{t.title}</p><p className="mt-1 text-xs text-[var(--color-text-dim)]">{t.status==='done'?'Выполнена':t.status==='in_progress'?'В работе':'Запланирована'}{t.dueDate?' · срок':''}</p></div>)}</div> : <p className="text-sm text-[var(--color-text-muted)]">На этот день задач нет.</p>}
        <div className="mt-6 border-t border-[var(--color-border)] pt-4"><p className="mb-2 text-xs text-[var(--color-text-dim)]">Активные привычки</p>{habits?.length ? habits.map(h=><p key={h.id} className="py-1 text-sm">{h.title}</p>) : <p className="text-sm text-[var(--color-text-muted)]">Нет активных привычек.</p>}</div>
      </section>
    </div>
  </div>
}
