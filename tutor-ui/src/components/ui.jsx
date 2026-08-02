import { useEffect, useState } from 'react'

export function PageTitle({ eyebrow, children }) {
  return (
    <div className="page-title-block">
      <p className="page-eyebrow mb-2 text-lg font-semibold text-indigo-300">{eyebrow}</p>
      <h1 className="page-title text-4xl font-bold tracking-tight text-white sm:text-5xl">{children}</h1>
    </div>
  )
}

export function BigButton({ className = '', children, type, onClick, ...props }) {
  return (
    <button
      type={type ?? (onClick ? 'button' : 'submit')}
      onClick={onClick}
      {...props}
      className={`ui-big-button flex min-h-16 items-center justify-center gap-3 rounded-2xl px-5 text-lg font-bold transition-colors disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, as = 'input', className = '', ...props }) {
  if (props.type === 'date') return <SegmentedDateField label={label} {...props} />
  const Component = as
  return (
    <label className="ui-field block text-lg font-semibold text-slate-200">
      <span>{label}</span>
      <Component {...props} className={`mt-2 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-lg text-white placeholder:text-slate-500 ${className}`} />
    </label>
  )
}

function SegmentedDateField({ label, name, value, defaultValue, onChange, required }) {
  const normalize = (dateValue) => {
    const [year = '', month = '', day = ''] = (dateValue || '').split('-')
    return { year, month: month ? String(Number(month)) : '', day: day ? String(Number(day)) : '' }
  }
  const currentYear = new Date().getFullYear()
  const isBirthDate = name === 'birthDate'
  const [parts, setParts] = useState(() => {
    const initial = normalize(value ?? defaultValue)
    if (!initial.year && !isBirthDate) initial.year = String(currentYear)
    return initial
  })
  useEffect(() => {
    if (value === undefined) return
    const next = normalize(value)
    if (!next.year && !isBirthDate) next.year = String(currentYear)
    setParts(next)
  }, [currentYear, isBirthDate, value])
  const firstYear = isBirthDate ? currentYear : currentYear + 5
  const yearCount = isBirthDate ? 21 : 26
  const years = Array.from({ length: yearCount }, (_, index) => firstYear - index)
  const days = Array.from(
    { length: new Date(Number(parts.year || currentYear), Number(parts.month || 1), 0).getDate() },
    (_, index) => index + 1,
  )
  const update = (part, nextValue) => {
    const next = { ...parts, [part]: nextValue }
    const maxDay = new Date(Number(next.year || currentYear), Number(next.month || 1), 0).getDate()
    if (next.day && Number(next.day) > maxDay) next.day = String(maxDay)
    setParts(next)
    if (next.year && next.month && next.day) {
      onChange?.({ target: { name, value: `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}` } })
    }
  }
  const dateValue = parts.year && parts.month && parts.day
    ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    : ''
  const selectClass = 'min-h-14 rounded-xl border border-slate-600 bg-slate-800 px-3 text-lg text-white'
  return (
    <fieldset className="ui-field block text-lg font-semibold text-slate-200">
      <legend>{label}</legend>
      <input type="hidden" name={name} value={dateValue} />
      <div className="mt-2 grid grid-cols-3 gap-3">
        <select aria-label={`${label}: año`} required={required} value={parts.year} onChange={(event) => update('year', event.target.value)} className={selectClass}>
          <option value="">Año</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select aria-label={`${label}: mes`} required={required} value={parts.month} onChange={(event) => update('month', event.target.value)} className={selectClass}>
          <option value="">Mes</option>
          {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
        <select aria-label={`${label}: día`} required={required} value={parts.day} onChange={(event) => update('day', event.target.value)} className={selectClass}>
          <option value="">Día</option>
          {days.map((day) => <option key={day} value={day}>{day}</option>)}
        </select>
      </div>
    </fieldset>
  )
}
