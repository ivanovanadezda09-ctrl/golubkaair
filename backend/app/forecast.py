from datetime import date, timedelta
from hashlib import sha256
from math import ceil, floor
from pathlib import Path
import os

import numpy as np
import pandas as pd
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

QUANTILES = [f"0.{i}" for i in range(1, 10)]
SUFFIXES = ("base_demand", "price", "price_demand")
FORECAST_COLUMNS = {"route", "date", "seats"} | {f"{q}_{s}" for q in QUANTILES for s in SUFFIXES}
ROUTE_NUMBERS = ["base_price", "price_sensitivity", "price_min", "price_max", "cost_per_passenger"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")
    route: str = Field(pattern=r"^[A-Z]{3}-[A-Z]{3}$")
    date: date
    price: float = Field(ge=0, le=1_000_000, allow_inf_nan=False)


def revenue_optimal_price(base_demand: float, seats: int, route: dict) -> int:
    """Maximize median revenue over whole-ruble prices in the route range."""
    lower, upper = ceil(route["price_min"]), floor(route["price_max"])
    sensitivity, base_price = route["price_sensitivity"], route["base_price"]
    if sensitivity == 0:
        return upper
    zero_demand = base_price + base_demand / sensitivity
    full_capacity = base_price + (base_demand - seats) / sensitivity
    peak = min(upper, max(lower, zero_demand / 2, full_capacity))

    def revenue(price: int) -> float:
        demand = base_demand - sensitivity * (price - base_price)
        return price * min(seats, max(0, demand))

    return max((floor(peak), ceil(peak)), key=revenue)


class Dataset:
    def __init__(self, folder: Path):
        forecast, routes = folder / "my_forecast.csv", folder / "routes.csv"
        self.version = sha256(forecast.read_bytes() + routes.read_bytes()).hexdigest()[:16]
        table = pd.read_csv(forecast)
        params = pd.read_csv(routes)
        if set(table.columns) != FORECAST_COLUMNS or not {"route", "name", *ROUTE_NUMBERS} <= set(params.columns):
            raise ValueError("Некорректные столбцы CSV")
        if table.isna().any().any() or params.isna().any().any():
            raise ValueError("В CSV есть пропуски")
        if table.duplicated(["route", "date"]).any() or params.route.duplicated().any():
            raise ValueError("В CSV есть дубликаты")
        if set(table.route) != set(params.route) or len(params) != 5:
            raise ValueError("Списки маршрутов должны совпадать")
        values = table[list(FORECAST_COLUMNS - {"route", "date"})].apply(pd.to_numeric)
        numbers = params[ROUTE_NUMBERS].apply(pd.to_numeric)
        if not np.isfinite(values).all().all() or not np.isfinite(numbers).all().all() or (values < 0).any().any() or (numbers < 0).any().any():
            raise ValueError("В CSV есть недопустимые числа")
        if (values.seats <= 0).any() or (values.seats % 1 != 0).any():
            raise ValueError("Вместимость должна быть положительным целым числом")
        if not (numbers.price_min.le(numbers.base_price) & numbers.base_price.le(numbers.price_max) & numbers.price_max.gt(numbers.price_min)).all():
            raise ValueError("Некорректные границы цен")
        if any(ceil(low) > floor(high) for low, high in zip(numbers.price_min, numbers.price_max)):
            raise ValueError("В диапазоне маршрута нет целой цены в рублях")
        if (np.diff(values[[f"{q}_base_demand" for q in QUANTILES]], axis=1) < 0).any():
            raise ValueError("Квантили спроса пересекаются")
        expected = {(r, (date(2026, 6, 1) + timedelta(days=i)).isoformat()) for r in params.route for i in range(31)}
        if set(zip(table.route, table.date)) != expected:
            raise ValueError("Неполный диапазон прогноза")
        self.routes = params.set_index("route").to_dict("index")
        self.rows = table.set_index(["route", "date"]).to_dict("index")
        self.dates = sorted(set(table.date))

    def calculate(self, query: Input):
        route = self.routes.get(query.route)
        if route is None:
            raise HTTPException(404, "Маршрут отсутствует")
        row = self.rows.get((query.route, query.date.isoformat()))
        if row is None:
            raise HTTPException(404, "На эту дату прогноза нет")
        shift = route["price_sensitivity"] * (query.price - route["base_price"])
        quantiles = [{"q": float(q), "demand": row[f"{q}_base_demand"] - shift,
                      "recommended_price": row[f"{q}_price"],
                      "base_demand": row[f"{q}_base_demand"],
                      "recommended_sales": min(row["seats"], row[f"{q}_price_demand"])} for q in QUANTILES]
        demand = quantiles[4]["demand"]
        seats = row["seats"]
        sales = min(seats, max(0, demand))
        return {**query.model_dump(mode="json"), "version": self.version, **route,
                "seats": seats, "demand": demand, "sales": sales,
                "load": 100 * sales / seats, "revenue": query.price * sales,
                "model_profit": (query.price - route["cost_per_passenger"]) * sales,
                "remaining": seats - sales, "quantiles": quantiles,
                "revenue_optimal_price": revenue_optimal_price(row["0.5_base_demand"], seats, route)}


def load_dataset():
    folder = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
    return Dataset(folder)
