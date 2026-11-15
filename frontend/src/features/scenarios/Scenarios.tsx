import {useState, type FormEvent} from 'react'
import {Area, AreaChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis} from 'recharts'
import {Link} from 'react-router-dom'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, money, number, shortDate, type Forecast, type Input, type Scenario} from '../../api'
import {Pigeon} from '../../components/Brand'
import {Status} from '../../components/Status'

export function SaveScenario({f}: {f:Forecast}) {
  const cache=useQueryClient()
  const [message,setMessage]=useState(''), [error,setError]=useState<Error|null>(null), [busy,setBusy]=useState(false)
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null);setMessage('');setBusy(true)
    try {
      await api('/scenarios','POST',{route:f.route,date:f.date,price:f.price,title:new FormData(e.currentTarget).get('title')})
      await cache.invalidateQueries({queryKey:['scenarios']})
      setMessage('Сценарий сохранён')
    } catch(e) {setError(e as Error)} finally {setBusy(false)}
  }
  return <form className="panel save" onSubmit={submit}><label>Название сценария<input name="title" required maxLength={100} placeholder="Например, рейс на выходные"/></label>
    <button className="primary" disabled={busy}>Сохранить расчёт</button><span role="status">{message && <Pigeon pose="success"/>}{message}</span><Status error={error}/></form>
}

export function Scenarios({user,restore}: {user?:{email:string};restore:(value:Input)=>void}) {
  const cache=useQueryClient()
  const all=useQuery({queryKey:['scenarios',user?.email],queryFn:()=>api<Scenario[]>('/scenarios'),enabled:!!user})
  const [selected,setSelected]=useState<number[]>([]), [detail,setDetail]=useState<Scenario|null>(null), [error,setError]=useState<Error|null>(null)
  const [search,setSearch]=useState('')
  const [routeFilter,setRouteFilter]=useState('')
  const [dateFilter,setDateFilter]=useState('')
  const [favoritesOnly,setFavoritesOnly]=useState(false)
  if(!user) return <section className="panel chart"><h2>Сохраняйте расчёты в аккаунте</h2><p>Войдите, чтобы сохранять расчёты. Смотреть прогноз и сравнивать цены можно и без входа.</p></section>
  async function act(id:number,remove:boolean) {
    setError(null)
    try {
      if(remove) {
        await api('/scenarios/'+id,'DELETE')
        if(detail?.id===id) setDetail(null)
        setSelected(s=>s.filter(v=>v!==id))
        await cache.invalidateQueries({queryKey:['scenarios']})
      } else setDetail(await api<Scenario>('/scenarios/'+id))
    } catch(e) {setError(e as Error)}
  }
  async function toggleFavorite(item:Scenario) {
    setError(null)
    try {
      await api('/scenarios/'+item.id+'/favorite','PATCH',{favorite:!item.favorite})
      await cache.invalidateQueries({queryKey:['scenarios']})
    } catch(e) {setError(e as Error)}
  }
  const scenarios=all.data??[]
  const filtered=scenarios.filter(item=>
    (!favoritesOnly || item.favorite) && (!routeFilter || item.route===routeFilter) &&
    (!dateFilter || item.date===dateFilter) &&
    (item.title+' '+item.snapshot.name).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
  const compare=scenarios.filter(s=>selected.includes(s.id))
  const profit=(s:Scenario)=>s.snapshot.model_profit??
    (Number.isFinite(s.snapshot.cost_per_passenger)?s.snapshot.revenue-s.snapshot.cost_per_passenger*s.snapshot.sales:undefined)
  const profits=scenarios.map(profit)
  return <><Status error={all.error??error} loading={all.isPending}/>
    <section className="panel scenario-filters" aria-label="Фильтры сценариев">
      <input type="search" aria-label="Поиск сценариев" placeholder="Найти сценарий…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="Фильтр маршрутов" value={routeFilter} onChange={e=>setRouteFilter(e.target.value)}><option value="">Все рейсы</option>
        {[...new Map(scenarios.map(s=>[s.route,s.snapshot.name]))].map(([route,name])=><option key={route} value={route}>{name}</option>)}
      </select>
      <select aria-label="Фильтр дат" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="">Все даты</option>
        {[...new Set(scenarios.map(s=>s.date))].sort().map(date=><option key={date} value={date}>{shortDate(date)}</option>)}
      </select>
      <label className="check"><input type="checkbox" checked={favoritesOnly} onChange={e=>setFavoritesOnly(e.target.checked)}/> Только избранные</label>
      <Link className="primary new-scenario" to="/">＋ Новый расчёт</Link>
    </section>
    {all.data && filtered.length===0 && <section className="panel chart"><h2>{scenarios.length?'По этим фильтрам ничего не найдено':'Пока нет сценариев'}</h2><Link to="/">Открыть прогноз</Link></section>}
    <div className="scenario-list">{filtered.map(s=><article className={'panel scenario '+(s.favorite?'is-favorite':'')} key={s.id}>
      <img className="destination" src={`/destination-${s.route.split('-')[1].toLowerCase()}.webp`} alt=""/>
      <div className="scenario-route"><h2>{s.snapshot.name.replace(' — ',' → ')}</h2><p>{s.title}</p>
        <p>{shortDate(s.date)} 2026 · {number(s.snapshot.seats)} мест</p></div>
      <div className="scenario-price"><span>Цена сценария</span><strong>{money(s.price)}</strong></div>
      <div className="scenario-stats"><span>Спрос <b>{number(s.snapshot.demand,1)} чел.</b></span><span>Продажи <b>{number(s.snapshot.sales,1)} бил.</b></span>
        <span>Прибыль <b>{profit(s)===undefined?'—':money(profit(s)!)}</b></span></div>
      {s.snapshot.quantiles?.length===9 && <div className="scenario-sparkline" role="img" aria-label="Квантили сохранённого спроса">
        <ResponsiveContainer><AreaChart data={s.snapshot.quantiles} margin={{top:6,right:8,bottom:3,left:8}}>
          <XAxis hide type="number" dataKey="q" domain={[.1,.9]}/><YAxis hide domain={['dataMin','dataMax']}/>
          <Area type="linear" dataKey="demand" stroke="#2566ae" fill="#a8cee9" fillOpacity={.5} isAnimationActive={false}/>
          <ReferenceDot x={.5} y={s.snapshot.demand} r={4} fill="#e57d37" stroke="white"/>
        </AreaChart></ResponsiveContainer>
      </div>}
      <div className="scenario-actions">
        <button aria-label={s.favorite?'Убрать из избранного':'В избранное'} aria-pressed={s.favorite} onClick={()=>void toggleFavorite(s)}>{s.favorite?'★':'☆'}</button>
        <details><summary aria-label="Действия сценария">•••</summary><div className="scenario-menu">
          <button onClick={()=>act(s.id,false)}>Открыть</button><button onClick={()=>act(s.id,false)}>Пересчитать</button><button onClick={()=>act(s.id,true)}>Удалить</button>
          <label className="check"><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/>Сравнить</label>
        </div></details>
      </div>
    </article>)}</div>
    {detail?.current && <section className="panel chart"><h2>{detail.title}</h2><p>Как изменился прогноз после пересчёта</p>
      <p>Спрос {number(detail.difference!.demand,1)} чел. · Продажи {number(detail.difference!.sales,1)} бил. · Выручка {money(detail.difference!.revenue)}</p>
      <p>Версия сохранённых данных · {detail.version} / текущая · {detail.current.version}</p>
      <Link to="/" onClick={()=>restore({route:detail.route,date:detail.date,price:detail.price})}>Открыть в прогнозе</Link>
    </section>}
    {compare.length>=2 && <section className="panel chart"><h2>Сравнение сохранённых расчётов</h2><div className="table-wrap"><table><thead><tr><th>Сценарий</th><th>Цена</th><th>Спрос</th><th>Продажи</th><th>Выручка</th></tr></thead>
      <tbody>{compare.map(s=><tr key={s.id}><td>{s.title}</td><td>{money(s.price)}</td><td>{number(s.snapshot.demand,1)}</td><td>{number(s.snapshot.sales,1)}</td><td>{money(s.snapshot.revenue)}</td></tr>)}</tbody></table></div></section>}
    {all.data && <section className="panel scenario-summary"><div><span>Всего сценариев</span><strong>{scenarios.length}</strong></div>
      <div><span>Избранных</span><strong>{scenarios.filter(s=>s.favorite).length}</strong></div>
      <div><span>Суммарная прибыль</span><strong>{profits.some(p=>p===undefined)?'—':money(profits.reduce<number>((sum,p)=>sum+(p??0),0))}</strong></div></section>}
  </>
}
