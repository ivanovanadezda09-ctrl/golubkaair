import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api, money, number, shortDate} from '../../api'
import {Status} from '../../components/Status'
import './optimal-price-calendar.css'

type CalendarDay = {date:string; price:number; profit:number; sales:number}

const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const compact=new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1})
const monthLabel=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'})

export function OptimalPriceCalendar({route,routeName,date,selectDate}: {
  route:string; routeName:string; date:string; selectDate:(date:string)=>void
}) {
  const [viewMonth,setViewMonth]=useState<{date:string; month:string}>()
  const query=useQuery({
    queryKey:['pricing-calendar',route], staleTime:Infinity,
    queryFn:()=>api<CalendarDay[]>('/pricing/calendar?route='+encodeURIComponent(route)),
  })
  const days=query.data??[]
  const months=[...new Set(days.map(day=>day.date.slice(0,7)))].sort()
  const month=viewMonth?.date===date?viewMonth.month:date.slice(0,7)
  const monthIndex=months.indexOf(month)
  const monthDays=days.filter(day=>day.date.startsWith(month+'-'))
  const best=monthDays.reduce<CalendarDay|undefined>((current,day)=>
    !current||day.profit>current.profit?day:current,undefined)
  const firstDay=new Date(month+'-01T00:00:00Z')
  const offset=(firstDay.getUTCDay()+6)%7

  return <section className="panel optimal-calendar" aria-labelledby="optimal-calendar-title">
    <div className="optimal-calendar-header">
      <h2 id="optimal-calendar-title">Календарь оптимальных цен</h2>
      <div className="optimal-calendar-nav">
        <button type="button" aria-label="Предыдущий месяц" disabled={monthIndex<=0}
          onClick={()=>setViewMonth({date,month:months[monthIndex-1]})}>‹</button>
        <strong aria-live="polite">{monthLabel.format(firstDay)}</strong>
        <button type="button" aria-label="Следующий месяц" disabled={monthIndex<0||monthIndex>=months.length-1}
          onClick={()=>setViewMonth({date,month:months[monthIndex+1]})}>›</button>
      </div>
    </div>
    <p className="muted">На каждый доступный день — рекомендованная цена и прибыль при ней по медианному прогнозу.</p>
    <Status error={query.error} loading={query.isPending}/>
    {monthDays.length>0 && <div className="optimal-calendar-grid">
      {weekdays.map(day=><span className="optimal-weekday" key={day}>{day}</span>)}
      {Array.from({length:offset},(_,i)=><span aria-hidden="true" key={i}/>)}
      {monthDays.map(day=><button type="button" key={day.date} aria-pressed={day.date===date}
        className={day.date===best?.date?'optimal-best':''}
        aria-label={shortDate(day.date)+', цена '+money(day.price)+', прибыль '+money(day.profit)+(day.date===best?.date?', максимум за месяц':'')}
        title={`${shortDate(day.date)} 2026 · ${routeName}
Оптимальная цена: ${money(day.price)}
Прогноз продаж: ${number(day.sales,1)} бил.
Прибыль по модели: ${money(day.profit)}`}
        onClick={()=>{setViewMonth(undefined);selectDate(day.date)}}>
        <span className="optimal-day">{Number(day.date.slice(-2))}{day.date===best?.date&&<span aria-hidden="true"> ✦</span>}</span>
        <strong className="optimal-full">{money(day.price)}</strong>
        <small className="optimal-full">{money(day.profit)}</small>
        <strong className="optimal-compact">{compact.format(day.price)}</strong>
        <small className="optimal-compact">{compact.format(day.profit)}</small>
      </button>)}
    </div>}
    {best && <p className="muted optimal-calendar-legend">✦ Самый прибыльный день по модели — {shortDate(best.date)}, {money(best.profit)}.</p>}
  </section>
}
