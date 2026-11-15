import {money, type Input, type Route} from '../../api'
import {PriceCalendar} from './PriceCalendar'

export function FlightForm({value, change, routes, dates, slider, calculate, selectDate}: {
  value:Input; change:(input:Input)=>void; routes:Route[]; dates:string[]; slider:boolean; calculate:()=>void; selectDate:(date:string)=>void
}) {
  const active = routes.find(r=>r.route===value.route)
  const [from,to] = active?.route.split('-') ?? ['','']
  const [origin, destination] = active?.name.split(' — ') ?? ['','']
  return <form className="panel parameters" aria-label="Параметры рейса" onSubmit={e=>{e.preventDefault(); calculate()}}>
    <label>Откуда<select aria-label="Откуда" value={from} onChange={e=>{
      const route=routes.find(r=>r.route.startsWith(e.target.value+'-'))
      if(route) change({...value,route:route.route,price:route.base_price})
    }}>{[...new Map(routes.map(r=>[r.route.split('-')[0],r.name.split(' — ')[0]]) )].map(([code,name])=>
      <option key={code} value={code}>{name}</option>)}</select></label>
    <label>Куда<select aria-label="Куда" value={to} onChange={e=>{
      const route=routes.find(r=>r.route===from+'-'+e.target.value)
      if(route) change({...value,route:route.route,price:route.base_price})
    }}>{routes.filter(r=>r.route.startsWith(from+'-')).map(r=>
      <option key={r.route} value={r.route.split('-')[1]}>{r.name.split(' — ')[1]}</option>)}</select></label>
    <PriceCalendar route={value.route} date={value.date} dates={dates} selectDate={selectDate}/>
    <label>Цена билета, ₽<input type="number" min={0} max={1000000} step="any" value={Number.isFinite(value.price)?value.price:''}
      onChange={e=>change({...value,price:e.target.valueAsNumber})}/></label>
    {slider && active && <label className="slider"><span className="sr-only">Диапазон цен · {origin} — {destination}</span>
      <input type="range" min={active.price_min} max={active.price_max} step={50}
        value={value.price} onChange={e=>change({...value,price:e.target.valueAsNumber})}/>
      <span><span>{money(active.price_min)}</span><span>{money(active.price_max)}</span></span>
    </label>}
    <button className="primary calculate">Рассчитать <span aria-hidden="true">→</span></button>
  </form>
}
