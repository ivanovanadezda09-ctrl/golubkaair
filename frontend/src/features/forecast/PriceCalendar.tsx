import {useEffect, useId, useRef, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api, money, shortDate} from '../../api'
import './price-calendar.css'

const weekdays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const monthLabel = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'})

export function PriceCalendar({route,date,dates,selectDate}: {
  route:string; date:string; dates:string[]; selectDate:(date:string)=>void
}) {
  const id=useId()
  const trigger=useRef<HTMLButtonElement>(null)
  const panel=useRef<HTMLDivElement>(null)
  const [open,setOpen]=useState(false)
  const [month,setMonth]=useState(date.slice(0,7))
  const months=[...new Set(dates.map(day=>day.slice(0,7)))]
  const prices=useQuery({
    queryKey:['calendar-prices',route], enabled:open&&Boolean(route), staleTime:Infinity,
    queryFn:()=>api<Record<string,number>>('/calendar/prices?route='+encodeURIComponent(route)),
  })

  useEffect(()=>{
    const popover=panel.current!
    popover.setAttribute('popover','auto')
    trigger.current!.popoverTargetElement=popover
    const sync=()=>setOpen(popover.matches(':popover-open'))
    popover.addEventListener('toggle',sync)
    return ()=>popover.removeEventListener('toggle',sync)
  },[])

  function position() {
    const anchor=trigger.current!.getBoundingClientRect()
    const popover=panel.current!
    const width=Math.min(365,window.innerWidth-20)
    const above=anchor.top-17
    const below=window.innerHeight-anchor.bottom-17
    const height=Math.min(410,window.innerHeight-20)
    const top=below>=height?anchor.bottom+7:above>=height?anchor.top-height-7:Math.max(10,(window.innerHeight-height)/2)
    popover.style.left=Math.max(10,Math.min(anchor.left,window.innerWidth-width-10))+'px'
    popover.style.top=top+'px'
    popover.style.maxHeight=Math.min(height,window.innerHeight-top-10)+'px'
  }

  useEffect(()=>{
    if(!open) return
    window.addEventListener('resize',position)
    return ()=>window.removeEventListener('resize',position)
  },[open])

  function toggle() {
    if(panel.current!.matches(':popover-open')) return
    setMonth(date.slice(0,7))
    position()
  }

  const monthDate=new Date(month+'-01T00:00:00Z')
  const start=(monthDate.getUTCDay()+6)%7
  const dayCount=new Date(Date.UTC(monthDate.getUTCFullYear(),monthDate.getUTCMonth()+1,0)).getUTCDate()
  const index=months.indexOf(month)

  return <div className="price-date-field">
    <span id={id+'-label'}>Дата вылета</span>
    <button ref={trigger} type="button" className="price-date-trigger" aria-labelledby={id+'-label '+id+'-value'}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={toggle}>
      <span id={id+'-value'}>{shortDate(date)} {date.slice(0,4)}</span><span className="price-date-chevron" aria-hidden="true"/>
    </button>
    <div id={id} ref={panel} className="price-calendar" role="dialog" aria-label="Календарь рекомендованных цен">
      <div className="price-calendar-header">
        <button type="button" aria-label="Предыдущий месяц" disabled={index<=0} onClick={()=>setMonth(months[index-1])}>‹</button>
        <strong aria-live="polite">{monthLabel.format(monthDate)}</strong>
        <button type="button" aria-label="Следующий месяц" disabled={index<0||index>=months.length-1} onClick={()=>setMonth(months[index+1])}>›</button>
      </div>
      <div className="price-calendar-grid">
        {weekdays.map(day=><span className="price-calendar-weekday" key={day}>{day}</span>)}
        {Array.from({length:start},(_,i)=><span key={'blank'+i}/>)}
        {Array.from({length:dayCount},(_,i)=>{
          const day=month+'-'+String(i+1).padStart(2,'0')
          const price=prices.data?.[day]
          return <button type="button" key={day} disabled={price===undefined} aria-pressed={date===day}
            aria-label={shortDate(day)+(price===undefined?'':', '+money(price))}
            onClick={()=>{selectDate(day);panel.current!.hidePopover();trigger.current!.focus()}}>
            <span>{i+1}</span>{price!==undefined&&<small>{money(price)}</small>}
          </button>
        })}
      </div>
      {prices.isFetching && <p role="status">Загружаем цены…</p>}
      {prices.isError && <p role="alert">Не удалось загрузить цены маршрута.</p>}
      <p className="price-calendar-note">Цены рассчитаны для медианного сценария спроса (квантиль 0.5).</p>
    </div>
  </div>
}
