from datetime import datetime, timezone
import os

from sqlalchemy import DateTime, ForeignKey, JSON, String, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class LoginSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    route: Mapped[str] = mapped_column(String(7))
    date: Mapped[str] = mapped_column(String(10))
    selected_price: Mapped[float]
    snapshot: Mapped[dict] = mapped_column(JSON)
    version: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    favorite: Mapped["ScenarioFavorite | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")


class ScenarioFavorite(Base):
    __tablename__ = "scenario_favorites"
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), primary_key=True)


class LoginLimit(Base):
    __tablename__ = "login_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int]
    expires_at: Mapped[datetime] = mapped_column(DateTime)


def connect():
    url = os.getenv("DATABASE_URL", "sqlite:///./reshis.sqlite3")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    if os.getenv("RENDER") == "true" and make_url(url).get_backend_name() != "postgresql":
        raise RuntimeError("На Render требуется DATABASE_URL для PostgreSQL")
    engine = create_engine(url, pool_pre_ping=True, hide_parameters=True)
    Base.metadata.create_all(engine)
    return sessionmaker(engine)
