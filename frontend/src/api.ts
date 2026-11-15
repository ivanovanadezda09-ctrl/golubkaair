export type Input = { route: string; date: string; price: number }
export type Route = { route: string; name: string; base_price: number; price_min: number; price_max: number; seats_by_date?: Record<string,number> }
export type Forecast = Input & Route & {
  price_sensitivity: number;
  version: string; seats: number; demand: number; sales: number; revenue: number; load: number; remaining: number; model_profit: number; cost_per_passenger: number; revenue_optimal_price: number;
  quantiles: { q: number; demand: number; recommended_price: number; base_demand: number; recommended_sales: number }[]
}
export type Scenario = Input & {
  id: number; favorite: boolean; title: string; snapshot: Forecast; version: string; created_at: string;
  current?: Forecast; difference?: Record<'demand' | 'sales' | 'revenue', number>
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method, credentials: 'same-origin', headers: {
      'Content-Type': 'application/json', 'X-Reshis-Request': '1',
    }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail :
      response.status === 422 ? 'Проверьте введённые данные' : 'Не удалось получить ответ сервера')
  }
  return response.json()
}
export const number = (x: number, digits = 0) => x.toLocaleString('ru-RU', {maximumFractionDigits: digits})
export const money = (x: number) => number(x) + ' ₽'
export const shortDate = (date: string) => new Intl.DateTimeFormat('ru-RU', {
  day:'numeric', month:'long', timeZone:'UTC',
}).format(new Date(date))
