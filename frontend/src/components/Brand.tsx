import {useEffect, useId, useRef, useState} from 'react'

export function Pigeon({pose, className = ''}: {pose: 'front'|'detective'|'flying'|'analytics'|'explaining'|'success'|'empty'; className?:string}) {
  return <img className={className} src={`/mascot-${pose === 'success' || pose === 'empty' ? 'explaining' : pose}.webp`} alt="" />
}

export function Info({children,label}: {children:string;label:string}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const answer = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function dismissOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!button.current?.contains(target) && !answer.current?.contains(target)) setOpen(false)
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissWithEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissWithEscape)
    }
  }, [open])

  return <>
    <button ref={button} type="button" className="info-toggle" aria-label={`Подробнее: ${label}`}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>ⓘ</button>
    <span id={id} ref={answer} className="info-answer" hidden={!open}>{children}</span>
  </>
}

export function Hero({pricing=false, scenarios=false}: {pricing?:boolean; scenarios?:boolean}) {
  return <div className="hero sky-hero">
    <div className="hero-art"><img src={`/coast-${scenarios?'bookmark':pricing?'chart':'flight'}.webp`} alt=""/></div>
    <svg className="flight-path" viewBox="0 0 740 140" aria-hidden="true"><path d="M5 120C100 150 180 35 110 55S135 162 255 75 430 25 520 57 630 87 730 14" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 7"/></svg>
    <div><h1>{scenarios?'Сохранённые сценарии':pricing?'Pricing Lab':'Узнай, сколько билетов купят!'}</h1>
    <p>{scenarios?'Ваши расчёты и лучшие цены!':pricing?'Найдём лучшую цену на рейс!':'Прогноз спроса, продаж и загрузки рейса'}</p></div>
  </div>
}
