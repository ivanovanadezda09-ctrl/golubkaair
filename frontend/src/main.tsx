import {Hero} from './components/Brand'
import {Status} from './components/Status'
import {FlightForm} from './features/forecast/FlightForm'
import {Metrics, Recommendation} from './features/forecast/Metrics'
import {Demand, Guide} from './features/analytics/Demand'
import {OptimalPriceCalendar} from './features/pricing/OptimalPriceCalendar'
import {Pricing, PricingSummary} from './features/pricing/Pricing'
import {Account} from './features/auth/Account'
import {SaveScenario, Scenarios} from './features/scenarios/Scenarios'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route as Page, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { api, type Forecast, type Input, type Route } from './api'
import './styles.css'
import './aviation.css'

const client = new QueryClient({defaultOptions:{queries:{retry:false, refetchOnWindowFocus:false}}})
const navigation = [
  ['/', '⌂', 'Главная'], ['/pricing', '▥', 'Pricing Lab'], ['/scenarios', '▤', 'Сохранённые сценарии'],
]
const example = {route:'MOW-AER', date:'2026-06-01', price:9000}

function Workspace({mode,input,setInput,requested,setRequested,user,openAccount}: {mode:string;input:Input;setInput:(i:Input)=>void;requested:Input|null;setRequested:(i:Input)=>void;openAccount:()=>void;user?:{email:string}}) {
  const routes=useQuery({queryKey:['routes'],queryFn:()=>api<Route[]>('/routes')})
  const dates=useQuery({queryKey:['dates'],queryFn:()=>api<string[]>('/dates')})
  const [saveOpen,setSaveOpen]=useState(false)
  const [comparisonOpen,setComparisonOpen]=useState(false)
  const valid=Number.isFinite(input.price)&&input.price>=0&&input.price<=1_000_000
  const forecast=useQuery({
    queryKey:['forecast',requested], enabled:requested!==null, staleTime:Infinity,
    queryFn:()=>api<Forecast>('/forecast','POST',requested),
  })
  const f=forecast.data
  const pendingChanges=requested && (requested.route!==input.route || requested.date!==input.date || requested.price!==input.price)
  function selectDate(date:string) {
    const selection={...input,date}
    setInput(selection)
    if(valid) setRequested(selection)
  }
  return <><Status error={routes.error??dates.error} loading={routes.isPending||dates.isPending}/>
    {routes.data&&dates.data&&<FlightForm value={input} change={setInput} routes={routes.data} dates={dates.data} selectDate={selectDate} slider calculate={()=>{if(valid) {if(requested===input) void forecast.refetch(); else setRequested(input)}}}/>}
    {!valid && <p className="error" role="alert">Укажите цену от 0 до 1 000 000 ₽.</p>}
    <Status error={forecast.error} loading={forecast.isFetching}/>
    {valid && routes.data && dates.data && (!requested || pendingChanges) &&
      <p className="forecast-note" role="status">{requested?'Показан последний расчёт. Нажмите «Рассчитать», чтобы обновить прогноз.':'Нажмите «Рассчитать», чтобы увидеть прогноз.'}</p>}
    {mode==='pricing' ? <>
      {f && <Pricing f={f} comparisonOpen={comparisonOpen} setComparisonOpen={setComparisonOpen}/>}
      <OptimalPriceCalendar route={input.route} routeName={routes.data?.find(route=>route.route===input.route)?.name ?? input.route} date={input.date} selectDate={selectDate}/>
      {f && <PricingSummary f={f} save={()=>user?setSaveOpen(true):openAccount()}/>}
    </> : f && <>
      {mode!=='demand'&&<Metrics forecast={f}/>}
      <div className="dashboard-analysis"><Demand f={f}/><div className="dashboard-notes"><Recommendation f={f} applyPrice={price=>setInput({route:f.route,date:f.date,price})}/><Guide/></div></div>
    </>}
    {f && user && (mode!=='pricing'||saveOpen) && <SaveScenario f={f}/>}
  </>
}

export function App() {
  const [input,setInput]=useState<Input>(example)
  const [requested,setRequested]=useState<Input|null>(null)
  const [accountRequest,setAccountRequest]=useState(0)
  const openAccount=()=>setAccountRequest(n=>n+1)
  const me=useQuery({queryKey:['me'],queryFn:()=>api<{email:string}>('/auth/me')})
  const user=me.data??undefined
  const workspace = {input,setInput,requested,setRequested,user,openAccount}
  return <div className="shell">
    <aside className="topbar"><Link to="/" className="brand"><img src="/coast-flight.webp" alt=""/><div>GOLUBKA AVIA</div></Link>
      <nav aria-label="Разделы">{navigation.map(([path,icon,label])=><NavLink end={path==='/'} key={path} to={path}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav>
      
      <div className="side-foot"><Account user={user} request={accountRequest}/></div>
    </aside>
    <main className="content"><Routes>
      <Page path="/" element={<><Hero/><Workspace mode="forecast" {...workspace}/></>}/>
      <Page path="/pricing" element={<><Hero pricing/><Workspace mode="pricing" {...workspace}/></>}/>
      <Page path="/demand" element={<><h1>Анализ спроса</h1><Workspace mode="demand" {...workspace}/></>}/>
      <Page path="/scenarios" element={<><Hero scenarios/><Scenarios key={user?.email} user={user} restore={setInput}/></>}/>
      <Page path="*" element={<p>Страница не найдена. <Link to="/">Открыть прогноз</Link></p>}/>
    </Routes></main>
  </div>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<QueryClientProvider client={client}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>)
