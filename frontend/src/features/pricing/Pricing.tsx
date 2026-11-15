import {useQuery} from '@tanstack/react-query'
import {Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {api, money, number, shortDate, type Forecast} from '../../api'
import {Status} from '../../components/Status'
import {Info} from '../../components/Brand'
import {Demand} from '../analytics/Demand'
import './pricing-analytics.css'

export function Pricing({f,comparisonOpen,setComparisonOpen}: {f:Forecast;comparisonOpen:boolean;setComparisonOpen:(open:boolean)=>void}) {
  const suggested = f.quantiles[4].recommended_price
  const optimum = f.revenue_optimal_price
  const candidates = [f.price, suggested, optimum]
  const samples = Array.from({length:41},(_,i)=>Math.round(f.price_min+(f.price_max-f.price_min)*i/40))
  const curve = [...new Set([...samples, ...candidates])].sort((a,b)=>a-b)
  const labels = ['Ваша цена', 'Максимум маржинального дохода · ML, 0,5', 'Максимум расчётной выручки · 0,5']
  const results=useQuery({queryKey:['pricing-v2',f.route,f.date,f.price],queryFn:()=>api<Forecast[]>('/pricing/compare','POST',{
    route:f.route,date:f.date,price:f.price,prices:[...candidates,...curve],
  })})
  const comparisons = results.data?.slice(0,3)
  return <><div className="route-strip"><h2>{f.name}</h2><span>{shortDate(f.date)} 2026</span></div>
    <section className="price-cards" aria-label="Сравнение ценовых сценариев">
      {candidates.map((p,i)=><article key={i}><span className="price-icon" aria-hidden="true">{["◇","✦","₽"][i]}</span><div><div className="inline-title">{labels[i]}
        {i===1&&<Info label="цена ML">Цена, при которой модель даёт наибольшую прибыль для медианного спроса с учётом расходов на пассажиров.</Info>}
        {i===2&&<Info label="максимум выручки">Цена, при которой сумма от продажи билетов будет наибольшей по медианному прогнозу.</Info>}</div>
        <strong>{money(p)}</strong></div></article>)}</section>
    <Status error={results.error} loading={results.isPending}/>
    {comparisons && results.data && <>
      <div className="pricing-charts">
        <section className="panel chart"><h2 className="inline-title">Прибыль и выручка от цены <Info label="прибыль по модели">Выручка — сумма от продажи билетов. Прибыль по модели — та же сумма за вычетом расходов на пассажиров.</Info></h2>
          <div className="plot" role="img" aria-label="График выручки">
            <ResponsiveContainer><LineChart data={results.data.slice(3)} margin={{top:25,right:20,bottom:22,left:3}}>
              <CartesianGrid vertical={false} stroke="var(--grid)"/>
              <XAxis type="number" dataKey="price" domain={['dataMin','dataMax']} tickFormatter={v=>number(v)} label={{value:'Цена билета, ₽',position:'insideBottom',offset:-13}}/>
              <YAxis width={61} tickFormatter={v=>number(v/1e6,1)+' млн'}/>
              <Tooltip labelFormatter={v=>money(Number(v))} formatter={v=>money(Number(v))}/>
              <ReferenceLine x={f.price} stroke="var(--navy)" strokeDasharray="3 4"/>
              <Line dataKey="revenue" name="Выручка" stroke="var(--blue)" strokeWidth={3} dot={false} isAnimationActive={false}/>
              <Line dataKey="model_profit" name="Прибыль по модели" stroke="var(--orange)" strokeWidth={3} dot={false} isAnimationActive={false}/>
              <ReferenceDot x={optimum} y={comparisons[2].revenue} label={{value:money(optimum),position:"top",fill:"var(--blue)",offset:9}} r={5} fill="var(--blue)" stroke="white" isFront/>
              <ReferenceDot x={suggested} y={comparisons[1].model_profit} label={{value:money(suggested),position:"bottom",fill:"var(--navy)",offset:8}} r={5} fill="var(--orange)" stroke="white" isFront/>
            </LineChart></ResponsiveContainer>
          </div>
          <div className="legend"><span>● Выручка · максимум {money(optimum)}</span><span>● Прибыль · цена ML {money(suggested)}</span><span>┆ Ваша цена · {money(f.price)}</span></div>
        </section>
        <Demand f={f} showMlPrices/>
        <section className="panel chart">
          <h2 className="inline-title">Продажи от цены <Info label="продажи от цены">График показывает, сколько билетов можно продать при каждой цене с учётом числа мест.</Info></h2>
          <div className="plot" role="img" aria-label="График продаж">
            <ResponsiveContainer><AreaChart data={results.data.slice(3)} margin={{top:25,right:20,bottom:22,left:3}}>
              <CartesianGrid stroke="var(--grid)"/>
              <XAxis type="number" dataKey="price" domain={['dataMin','dataMax']} tickFormatter={v=>number(v)} label={{value:'Цена билета, ₽',position:'insideBottom',offset:-13}}/>
              <YAxis width={61} tickFormatter={v=>number(v)}/>
              <Tooltip labelFormatter={v=>money(Number(v))} formatter={v=>[number(Number(v),1),'Продажи']}/>
              <Area type="linear" dataKey="sales" name="Продажи" stroke="var(--blue)" strokeWidth={2} fill="var(--sky)" fillOpacity={.22} dot={false} isAnimationActive={false}/>
            </AreaChart></ResponsiveContainer>
          </div>
        </section>
      </div>
      <section className="panel pricing-comparison">
        <h2>Сравнение результатов</h2>
        <p>В расчёте прибыли из выручки вычитаем {money(f.cost_per_passenger)} за каждый проданный билет.</p>
        <div className="pricing-scenarios">
          {comparisons.map((scenario,i)=><article key={i}>
            <h3><span className="pricing-scenario-icon" aria-hidden="true">{['🎟︎','▥','₽'][i]}</span>{['Ваша цена','Оптимум прибыли','Максимум выручки'][i]}</h3>
            <strong className="pricing-scenario-price">{money(scenario.price)}</strong>
            <dl>
              <div><dt>Спрос</dt><dd>{number(scenario.demand,1)} чел.</dd></div>
              <div><dt>Продажи</dt><dd>{number(scenario.sales,1)} бил.</dd></div>
              <div><dt>Выручка</dt><dd>{money(scenario.revenue)}</dd></div>
              <div className="pricing-scenario-profit"><dt>Прибыль по модели</dt><dd>{money(scenario.model_profit)}</dd></div>
            </dl>
          </article>)}
        </div>
        <details className="pricing-comparison-detail" open={comparisonOpen} onToggle={event=>setComparisonOpen(event.currentTarget.open)}>
          <summary>Показать подробную таблицу</summary>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Подробное сравнение цен"><table><thead><tr><th>Сценарий</th><th>Цена</th><th>Спрос</th><th>Продажи</th><th>Выручка</th><th>Прибыль по модели</th></tr></thead>
          <tbody>{comparisons.map((r,i)=><tr key={i} className={'price-row-'+i}><td>{labels[i]}</td><td>{money(r.price)}</td><td>{number(r.demand,1)}</td><td>{number(r.sales,1)}</td><td>{money(r.revenue)}</td><td>{money(r.model_profit)}</td></tr>)}</tbody></table></div>
        </details>
      </section>
    </>}
    <section className="panel pricing-quantiles">
      <h2>Как меняется оптимальная цена при разном спросе?</h2>
      <p>Для каждого квантильного сценария ML рассчитала цену, максимизирующую прибыль по модели.</p>
      <div className="pricing-quantile-layout">
        <div className="plot" aria-label="График оптимальных цен по квантилям">
          <ResponsiveContainer><AreaChart data={f.quantiles} margin={{top:12,right:16,bottom:20,left:0}}>
            <CartesianGrid vertical={false} stroke="var(--grid)"/>
            <XAxis dataKey="q" type="number" domain={[.1,.9]} padding={{left:6,right:6}} ticks={f.quantiles.map(point=>point.q)} tickFormatter={v=>number(v,1)} label={{value:'Квантиль',position:'insideBottom',offset:-12}}/>
            <YAxis width={70} domain={['auto','auto']} tickFormatter={v=>money(Number(v))}/>
            <Tooltip content={({active,label})=>{
              const point=active && f.quantiles.find(point=>point.q===Number(label))
              return point ? <div className="demand-tooltip">
                <b>Квантиль {number(point.q,1)}</b>
                <span>Спрос при базовой цене · {number(point.base_demand)} чел.</span>
                <span>Оптимальная цена · {money(point.recommended_price)}</span>
                <span>Прогноз продаж · {number(point.recommended_sales)} бил.</span>
              </div> : null
            }}/>
            <Area type="linear" dataKey="recommended_price" stroke="var(--blue)" strokeWidth={3} fill="var(--sky)" fillOpacity={.25} dot={{r:4,fill:'white',strokeWidth:2}} isAnimationActive={false}/>
            <ReferenceDot x={.5} y={suggested} r={6} fill="var(--orange)" stroke="white" isFront/>
          </AreaChart></ResponsiveContainer>
        </div>
        <aside className="pricing-quantile-note">
          <h3>Как выбрать ценовую стратегию?</h3>
          <p>Мы не знаем заранее, сколько пассажиров захотят полететь. Поэтому ML рассчитывает оптимальную цену для разных сценариев спроса.</p>
          <dl className="pricing-strategy">
            <div><dt><span>0.1</span> Осторожный</dt><dd>Рассматриваем низкий спрос и риск того, что покупателей будет меньше ожидаемого.</dd></div>
            <div><dt><span>0.5</span> Базовый</dt><dd>Медианный сценарий, по которому рассчитана основная рекомендация сайта.</dd></div>
            <div><dt><span>0.9</span> Оптимистичный</dt><dd>Рассматриваем ситуацию с высоким спросом.</dd></div>
          </dl>
          <p>Каждая цена оптимальна только для своего сценария. Чтобы оценить финансовые риски выбранной цены, нужно сравнивать её прибыль при нескольких сценариях спроса.</p>
        </aside>
      </div>
      <details className="pricing-quantile-detail">
        <summary>Точные значения по всем 9 квантилям</summary>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Таблица цен по квантилям">
        <table><thead><tr><th>Квантиль</th><th>Спрос при базовой цене</th><th>Оптимальная цена ML</th><th>Продажи при ней</th></tr></thead>
        <tbody>{f.quantiles.map(q=><tr key={q.q} className={q.q===.5?'median-row':''}><td>{number(q.q,1)}</td><td>{number(q.base_demand)} чел.</td><td>{money(q.recommended_price)}</td><td>{number(q.recommended_sales)} бил.</td></tr>)}</tbody></table>
        </div>
      </details>
    </section>

  </>
}

export function PricingSummary({f,save}: {f:Forecast;save:()=>void}) {
  return <section className="panel pricing-summary pricing-finale">
    <div>
      <h2>Итог</h2>
      <p>Оптимальная цена по прибыли</p>
      <strong>{money(f.quantiles[4].recommended_price)}</strong>
      <p>Максимальная выручка по прогнозу — при цене <b>{money(f.revenue_optimal_price)}</b>.</p>
    </div>
    <button className="primary" onClick={save}>Сохранить сценарий</button>
  </section>
}
