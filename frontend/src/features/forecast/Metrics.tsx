import {Link} from 'react-router-dom'
import {money, number, type Forecast} from '../../api'
import {Info} from '../../components/Brand'

export function Metrics({forecast:f}: {forecast:Forecast}) {
  const values = [
    ['Медианный спрос',number(f.demand,1),'чел.', 'Желают купить билет','◉','По прогнозу, примерно в половине случаев спрос будет на этой отметке или ниже.'],
    ['Прогноз продаж',number(f.sales,1),'бил.', 'С учётом числа мест','◇','Сколько билетов купят при этой цене с учётом числа свободных мест.'],
    ['Прибыль по модели',money(f.model_profit),'', 'После переменных затрат','₽','Выручка минус расходы на каждого пассажира. Постоянные расходы на рейс в этой оценке не учтены.'],
  ]
  return <div className="overview"><section className="panel metrics" aria-label="Прогноз">{values.map(([label,value,unit,note,icon,help],i)=>
    <article className={'panel metric '+(i===1?'accent':'')} key={label}>
      <span className="metric-icon" aria-hidden="true">{icon}</span><div><div className="inline-title">{label}<Info label={label}>{help}</Info></div>
      <strong>{value} <small>{unit}</small></strong><p>{note}</p></div></article>)}</section>
    
      <section className="panel load-card">
        <div className="split"><h2 className="inline-title">Загрузка рейса <Info label="загрузка">Какую долю всех мест займут пассажиры по медианному прогнозу.</Info></h2><b>{number(f.load,1)}%</b></div>
        <progress aria-label="Прогноз загрузки" max={100} value={f.load}/>
        <div className="split"><span>Продажи по прогнозу: <b>{number(f.sales,1)}</b> из {number(f.seats)} мест</span><span>Свободно по прогнозу: {number(f.remaining,1)} мест</span></div>
      </section>
  </div>
}

export function Recommendation({f,applyPrice}: {f:Forecast;applyPrice:(price:number)=>void}) {
  const price = f.quantiles[4]?.recommended_price
  return <section className="panel recommendation">
    <div><h2 className="inline-title">Оптимальная цена по прибыли · ML 0,5 <Info label="оптимальная цена">При этой цене модель даёт наибольшую прибыль для медианного спроса с учётом расходов на пассажиров.</Info></h2>
    {price!==undefined && <><strong>{money(price)}</strong><p>Расчёт для медианного спроса.</p>
    <button className="primary apply-price" onClick={()=>applyPrice(price)}>Подставить эту цену →</button></>}
    <Link className="pricing-link" to="/pricing">Сравнить в Pricing Lab →</Link></div>
  </section>
}
