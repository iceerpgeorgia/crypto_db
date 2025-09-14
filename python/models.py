from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    String,
    DateTime,
    Float,
    Integer,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class OHLC(Base):
    __tablename__ = "ohlc"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset: Mapped[str] = mapped_column(String(64), nullable=False)
    interval: Mapped[str] = mapped_column(String(16), nullable=False)  # e.g., '1d'
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("asset", "interval", "ts", name="uq_ohlc_asset_interval_ts"),
        Index("ix_ohlc_asset_ts", "asset", "ts"),
    )


class DominancePoint(Base):
    __tablename__ = "dominance_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset: Mapped[str] = mapped_column(String(16), nullable=False)  # e.g., 'BTC', 'ETH', 'USDT'
    interval: Mapped[str] = mapped_column(String(16), nullable=False)  # 'daily' | 'hourly'
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)  # dominance percentage 0..100

    __table_args__ = (
        UniqueConstraint("asset", "interval", "ts", name="uq_dom_asset_interval_ts"),
        Index("ix_dom_asset_ts", "asset", "ts"),
    )


class Divergence(Base):
    __tablename__ = "divergences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset: Mapped[str] = mapped_column(String(64), nullable=False)
    interval: Mapped[str] = mapped_column(String(16), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    indicator: Mapped[str] = mapped_column(String(32), nullable=False)  # 'RSI' | 'MACD'
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # 'bullish' | 'bearish'
    price_swing: Mapped[float] = mapped_column(Float, nullable=True)
    indicator_swing: Mapped[float] = mapped_column(Float, nullable=True)

    __table_args__ = (
        Index("ix_div_asset_ts", "asset", "ts"),
    )
