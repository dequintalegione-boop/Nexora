import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Palette, Settings2 } from 'lucide-react'

const accents = [
  { name: 'Бирюзовый', value: '#30d5c8' },
  { name: 'Синий', value: '#60a5fa' },
  { name: 'Фиолетовый', value: '#a78bfa' },
  { name: 'Розовый', value: '#f472b6' },
  { name: 'Оранжевый', value: '#fb923c' },
]

export function Settings() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [])
  const [accent, setAccent] = useState('#30d5c8')
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(1)
  useEffect(() => {
    if (!settings) return
    setAccent(settings.accentColor)
    setWeekStartsOn(settings.weekStartsOn)
  }, [settings])
  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', accent)
    document.documentElement.style.setProperty('--color-accent-soft', accent + '24')
    document.documentElement.style.setProperty('--color-accent-glow', accent + '66')
  }, [accent])
  async function save(patch: { accentColor?: string; weekStartsOn?: 0 | 1 }) {
    await db.settings.update('settings', patch)
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="animate-in"><div className="mb-1.5 flex items-center gap-2"><Settings2 size={14} className="text-[var(--color-accent)]"/><span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">Персонализация</span></div><h1 className="text-[28px] font-semibold">Настройки</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">Настрой внешний вид и начало недели.</p></div>
    <section className="glass-static space-y-5 p-5"><div className="flex items-center gap-2"><Palette size={16} className="text-[var(--color-accent)]"/><h2 className="text-sm font-medium">Акцентный цвет</h2></div><div className="flex flex-wrap gap-3">{accents.map(item=><button key={item.value} onClick={()=>{setAccent(item.value);void save({accentColor:item.value})}} aria-label={item.name} title={item.name} className={'h-10 w-10 rounded-full border-2 transition-transform '+(accent===item.value?'scale-110 border-white':'border-transparent')} style={{backgroundColor:item.value}}/>)}</div><div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4"><div><p className="text-sm font-medium">Начало недели</p><p className="mt-1 text-xs text-[var(--color-text-dim)]">Используется в календаре и планировании.</p></div><select value={weekStartsOn} onChange={e=>{const value=Number(e.target.value) as 0|1;setWeekStartsOn(value);void save({weekStartsOn:value})}} className="rounded-xl border border-[var(--color-border)] bg-white/[0.05] px-3 py-2 text-sm"><option value={1}>Понедельник</option><option value={0}>Воскресенье</option></select></div></section>
    <p className="text-xs text-[var(--color-text-dim)]">Настройки сохраняются в локальной базе данных этого браузера.</p>
  </div>
}
