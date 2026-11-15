from contextlib import asynccontextmanager
from datetime import timedelta
from hashlib import sha256
import logging
import os
from pathlib import Path
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, delete, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .forecast import Input, load_dataset
from .storage import connect, LoginLimit, LoginSession, Scenario, ScenarioFavorite, User, now

COOKIE = "reshis_session"
SESSION_HOURS = 24 * 7
passwords = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
dummy_hash = passwords.hash(secrets.token_urlsafe())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    if os.getenv("RENDER") == "true" and (
        os.getenv("SECURE_COOKIE") != "1" or not public_origin().startswith("https://")
    ):
        raise RuntimeError("На Render требуются HTTPS-адрес и SECURE_COOKIE=1")
    app.state.sessions = connect()
    try:
        app.state.dataset = load_dataset()
    except (OSError, ValueError) as exc:
        logger.error("Ошибка чтения данных: %s", exc)
        app.state.dataset = None
    yield


app = FastAPI(title="GOLUBKA AVIA", lifespan=lifespan)


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse({"detail": "Проверьте введённые данные"}, status_code=422)


@app.exception_handler(Exception)
async def server_error(request, exc):
    logger.exception("Ошибка сервера", exc_info=exc)
    return JSONResponse({"detail": "Внутренняя ошибка сервера"}, status_code=500)


def dataset(request: Request):
    if request.app.state.dataset is None:
        raise HTTPException(503, "Прогноз недоступен: проверьте файлы CSV")
    return request.app.state.dataset


def db(request: Request):
    with request.app.state.sessions() as session:
        yield session


def public_origin():
    return (os.getenv("PUBLIC_ORIGIN") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")


def csrf(request: Request):
    # Cross-origin HTML forms cannot set this header. The API permits no CORS origins.
    if request.headers.get("X-Reshis-Request") != "1":
        raise HTTPException(403, "Требуется запрос из приложения")
    origin = request.headers.get("Origin")
    expected = public_origin()
    if expected and origin and origin != expected:
        raise HTTPException(403, "Источник запроса не разрешён")


def token_hash(token: str):
    return sha256(token.encode()).hexdigest()


def current_session(request: Request, session=Depends(db)):
    token = request.cookies.get(COOKIE)
    entry = session.get(LoginSession, token_hash(token)) if token else None
    if not entry or entry.expires_at <= now():
        raise HTTPException(401, "Войдите в аккаунт")
    return entry


def sign_in(session, user, response):
    token = secrets.token_urlsafe(32)
    session.execute(delete(LoginSession).where(LoginSession.expires_at <= now()))
    session.add(LoginSession(token_hash=token_hash(token), user_id=user.id,
                             expires_at=now() + timedelta(hours=SESSION_HOURS)))
    session.commit()
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax",
                        secure=os.getenv("SECURE_COOKIE") == "1", max_age=SESSION_HOURS * 3600)
    return {"email": user.email}


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, email):
        email = email.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Укажите корректный email")
        return email


class Compare(Input):
    prices: list[float] = Field(max_length=80)


class Save(Input):
    title: str = Field(min_length=1, max_length=100, pattern=r"\S")


@app.get("/api/health")
def health(data=Depends(dataset), session=Depends(db)):
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "База данных недоступна") from None
    return {"status": "ok", "version": data.version}


@app.get("/api/routes")
def routes(data=Depends(dataset)):
    return [{"route": code, **route, "seats_by_date": {day: data.rows[code, day]["seats"] for day in data.dates}}
            for code, route in data.routes.items()]


@app.get("/api/dates")
def dates(route: str | None = None, data=Depends(dataset)):
    if route and route not in data.routes:
        raise HTTPException(404, "Маршрут отсутствует")
    return data.dates


@app.get("/api/calendar/prices")
def calendar_prices(route: str, data=Depends(dataset)):
    if route not in data.routes:
        raise HTTPException(404, "Маршрут отсутствует")
    return {day: data.rows[route, day]["0.5_price"] for day in data.dates}


@app.get("/api/pricing/calendar")
def pricing_calendar(route: str, data=Depends(dataset)):
    if route not in data.routes:
        raise HTTPException(404, "Маршрут отсутствует")

    days = []
    for day in data.dates:
        row = data.rows.get((route, day))
        if row is None:
            continue
        price = row["0.5_price"]
        forecast = data.calculate(Input(route=route, date=day, price=price))
        days.append({"date": day, "price": price, "profit": forecast["model_profit"], "sales": forecast["sales"]})
    return days


@app.post("/api/forecast")
def forecast(query: Input, data=Depends(dataset)):
    return data.calculate(query)


@app.post("/api/pricing/compare")
def compare(query: Compare, data=Depends(dataset)):
    import math
    if any(not math.isfinite(p) or p < 0 or p > 1_000_000 for p in query.prices):
        raise HTTPException(422, "Цены должны быть в диапазоне от 0 до 1 000 000 ₽")
    return [data.calculate(Input(route=query.route, date=query.date, price=p)) for p in query.prices]


@app.post("/api/auth/register", status_code=201, dependencies=[Depends(csrf)])
def register(query: Credentials, response: Response, session=Depends(db)):
    user = User(email=query.email, password_hash=passwords.hash(query.password))
    session.add(user)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Этот email уже зарегистрирован")
    return sign_in(session, user, response)


@app.post("/api/auth/login", dependencies=[Depends(csrf)])
def login(query: Credentials, request: Request, response: Response, session=Depends(db)):
    key = token_hash(request.client.host if request.client else "unknown")
    limit = session.get(LoginLimit, key)
    if limit and limit.expires_at <= now():
        session.delete(limit)
        session.flush()
        limit = None
    if limit and limit.attempts >= 8:
        raise HTTPException(429, "Слишком много попыток. Повторите через 10 минут")
    if not limit:
        limit = LoginLimit(key=key, attempts=0, expires_at=now() + timedelta(minutes=10))
        session.add(limit)
    limit.attempts += 1
    session.commit()
    user = session.scalar(select(User).where(User.email == query.email))
    try:
        valid = passwords.verify(user.password_hash if user else dummy_hash, query.password)
    except VerificationError:
        valid = False
    if not user or not valid:
        raise HTTPException(401, "Неверный email или пароль")
    return sign_in(session, user, response)


@app.post("/api/auth/logout", dependencies=[Depends(csrf)])
def logout(response: Response, entry=Depends(current_session), session=Depends(db)):
    session.delete(entry)
    session.commit()
    response.delete_cookie(COOKIE)
    return {"ok": True}


@app.get("/api/auth/me")
def me(entry=Depends(current_session), session=Depends(db)):
    return {"email": session.get(User, entry.user_id).email}


def describe(item):
    return {"id": item.id, "title": item.title, "route": item.route, "date": item.date,
            "price": item.selected_price, "snapshot": item.snapshot, "version": item.version,
            "created_at": item.created_at.isoformat() + "Z", "favorite": item.favorite is not None}


def owned(scenario_id, entry, session):
    item = session.get(Scenario, scenario_id)
    if item is None or item.user_id != entry.user_id:
        raise HTTPException(404, "Сценарий не найден")
    return item


@app.get("/api/scenarios")
def list_scenarios(entry=Depends(current_session), session=Depends(db)):
    return [describe(item) for item in session.scalars(select(Scenario).where(
        Scenario.user_id == entry.user_id).order_by(Scenario.id.desc()))]


@app.post("/api/scenarios", status_code=201, dependencies=[Depends(csrf)])
def save(query: Save, entry=Depends(current_session), session=Depends(db), data=Depends(dataset)):
    result = data.calculate(query)
    result.pop("title", None)
    item = Scenario(user_id=entry.user_id, title=query.title.strip(), route=query.route,
                    date=query.date.isoformat(), selected_price=query.price, snapshot=result, version=data.version)
    session.add(item)
    session.commit()
    return describe(item)


@app.get("/api/scenarios/{scenario_id}")
def scenario(scenario_id: int, entry=Depends(current_session), session=Depends(db), data=Depends(dataset)):
    item = owned(scenario_id, entry, session)
    current = data.calculate(Input(route=item.route, date=item.date, price=item.selected_price))
    return {**describe(item), "current": current,
            "difference": {k: current[k] - item.snapshot[k] for k in ("demand", "sales", "revenue")}}


class FavoriteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    favorite: bool


@app.patch("/api/scenarios/{scenario_id}/favorite", dependencies=[Depends(csrf)])
def favorite(scenario_id: int, query: FavoriteInput, entry=Depends(current_session), session=Depends(db)):
    item = owned(scenario_id, entry, session)
    if query.favorite and item.favorite is None:
        item.favorite = ScenarioFavorite()
    elif not query.favorite and item.favorite is not None:
        item.favorite = None
    session.commit()
    return describe(item)


@app.delete("/api/scenarios/{scenario_id}", dependencies=[Depends(csrf)])
def remove(scenario_id: int, entry=Depends(current_session), session=Depends(db)):
    session.delete(owned(scenario_id, entry, session))
    session.commit()
    return {"ok": True}


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path == "api" or path.startswith("api/"):
        raise HTTPException(404, "Метод API не найден")
    root = Path(os.getenv("FRONTEND_DIR", Path(__file__).resolve().parents[2] / "frontend/dist")).resolve()
    candidate = (root / path).resolve()
    if candidate.is_relative_to(root) and candidate.is_file():
        return FileResponse(candidate)
    if path.startswith("assets/"):
        raise HTTPException(404, "Файл не найден")
    if (root / "index.html").is_file():
        return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "Соберите интерфейс или запустите Vite")
