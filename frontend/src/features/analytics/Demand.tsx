import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {money, number, type Forecast} from '../../api'
import {Info} from '../../components/Brand'

export function Demand({f, showMlPrices = false}: {f:Forecast; showMlPrices?:boolean}) {
  const mlPrice = f.quantiles.find(point => point.q === .5)?.recommended_price
  const mlDemand = showMlPrices && mlPrice !== undefined ? f.quantiles.map(point => ({
    ...point,
    demand: Math.max(0, point.demand),
    demand_at_ml_price: Math.max(0, point.base_demand - f.price_sensitivity * (mlPrice - f.base_price)),
  })) : undefined
  const medianDemand = mlDemand ? Math.max(0, f.demand) : f.demand

  return <section className={showMlPrices ? "panel chart pricing-demand" : "panel chart"}>
    <h2 className="inline-title">Распределение спроса по квантилям <Info label="квантили">Что значит квантиль 0,9? По прогнозу, примерно в 9 случаях из 10 спрос будет не выше этой отметки.</Info></h2>
    <p>Девять оценок спроса при цене {money(f.price)}.</p>
    <div role="img" aria-label="График квантилей спроса" className="plot">
      <ResponsiveContainer><AreaChart data={mlDemand ?? f.quantiles} margin={{top:12,right:22,bottom:23,left:8}}>
        <CartesianGrid vertical={false} stroke="var(--grid)"/>
        <XAxis dataKey="q" type="number" domain={[.1,.9]} ticks={f.quantiles.map(q=>q.q)} tickFormatter={v=>number(v,1)} label={{value:'Квантиль прогноза',position:'insideBottom',offset:-14}}/>
        <YAxis width={67} tickFormatter={v=>number(v)} domain={['auto','auto']} label={{value:'Спрос, пассажиров',angle:-90,position:'insideLeft',offset:4}}/>
        {mlDemand && mlPrice !== undefined ? <Tooltip content={({active, label}) => {
          const point = active && mlDemand.find(point => point.q === Number(label))
          return point ? <div className="demand-tooltip">
            <b>Квантиль {number(point.q,1)}</b>
            <span>Спрос при вашей цене · {number(point.demand,1)} чел. ({money(f.price)})</span>
            <span>Рекомендованная цена ML · {money(mlPrice)}</span>
            <span>Спрос при цене ML · {number(point.demand_at_ml_price,1)} чел.</span>
          </div> : null
        }}/> : <Tooltip labelFormatter={v=>'Квантиль '+number(Number(v),1)} formatter={v=>[number(Number(v),1)+' чел.','Спрос']}/>}
        <Area type="linear" dataKey="demand" stroke="var(--blue)" strokeWidth={3} fill="var(--sky)" fillOpacity={.12} dot={{r:4,fill:'white',strokeWidth:2}} isAnimationActive={false}/>
        {mlDemand && <Area type="linear" dataKey="demand_at_ml_price" stroke="var(--orange)" strokeWidth={3} fill="none" dot={{r:4,fill:'white',strokeWidth:2}} isAnimationActive={false}/>}
        <ReferenceLine y={f.seats} stroke="var(--orange)" strokeWidth={2} strokeDasharray="6 4" ifOverflow="extendDomain"/>
        <ReferenceDot x={.5} y={medianDemand} r={6} fill="var(--orange)" stroke="white" isFront/>
      </AreaChart></ResponsiveContainer>
    </div>
    <div className="legend"><span>● Медиана · {number(medianDemand,1)} чел.</span><span>┄ Вместимость {mlDemand ? "—" : "·"} {number(f.seats)} мест</span></div>
    {mlDemand && mlPrice !== undefined && <>
      <div className="legend"><span>● Спрос при вашей цене — {money(f.price)}</span><span>● Спрос при рекомендованной цене ML — {money(mlPrice)}</span></div>
    </>}
    {f.demand<0 && <p className="muted">При такой цене модель прогнозирует ноль продаж.</p>}
    {mlDemand && <div className="pricing-lines-guide">
      <div>
        <h3>Почему линии отличаются?</h3>
        <p>Синяя линия показывает спрос при вашей цене, а оранжевая — при рекомендованной цене ML.</p>
        <p>Если цены совпадают, линии тоже совпадают.</p>
      </div>
      <img src="/pigeon-plane.png" alt=""/>
    </div>}
  </section>
}

export function Guide() {
  return <section className="panel guide">
    <div className="guide-heading"><img src="/coast-flight.webp" alt=""/><h2>Как читать прогноз?</h2></div>
    <div className="guide-topics">
      <div><h3><span aria-hidden="true">↔</span> Зачем несколько оценок?</h3><p>Спрос заранее неизвестен. Квантили показывают, каким он может быть при той же цене.</p></div>
      <div><h3><span aria-hidden="true">◉</span> Что такое медиана?</h3><p>Медиана (0,5) — отметка, которую спрос по прогнозу не превысит примерно в половине случаев.</p></div>
      <div><h3><span aria-hidden="true">◇</span> Почему продаж может быть меньше?</h3><p>У каждого билета своё место. Если желающих больше, продажи всё равно ограничены вместимостью.</p></div>
    </div>
  </section>
}
