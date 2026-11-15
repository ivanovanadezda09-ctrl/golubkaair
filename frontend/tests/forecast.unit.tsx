import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import { Metrics } from '../src/features/forecast/Metrics'
import { api, type Forecast } from '../src/api'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})

test('shows separately demand, capacity and capped sales',()=>{
  const forecast:Forecast={
    version:'test', route:'MOW-AER', date:'2026-06-01', name:'Москва — Сочи',
    price:9000, base_price:9000, price_min:5400, price_max:18000, price_sensitivity:0.141,
    demand:940, sales:900, seats:900, load:100, remaining:0, model_profit:4320000, cost_per_passenger:4200, revenue_optimal_price:9000, revenue:8100000, quantiles:[],
  }
  const {rerender}=render(<MemoryRouter><Metrics forecast={forecast}/></MemoryRouter>)
  expect(screen.getByText('940',{selector:'strong'})).toBeTruthy()
  expect(screen.getByText('900',{selector:'.accent strong'})).toBeTruthy()
  rerender(<MemoryRouter><Metrics forecast={{...forecast, demand:800,sales:800, remaining:100}}/></MemoryRouter>)
  expect(screen.getByText('800',{selector:'.accent strong'})).toBeTruthy()
})

test('shows the error returned by the API',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Маршрут отсутствует'}),{status:404})))
  await expect(api('/forecast','POST',{})).rejects.toThrow('Маршрут отсутствует')
})
