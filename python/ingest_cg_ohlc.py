from __future__ import annotations

import argparse
import datetime as dt
import os
from typing import List, Dict

import requests
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from db import engine
from models import Base, OHLC


COINGECKO_BASE = "https://api.coingecko.com/api/v3"


def fetch_ohlc_daily(asset_id: str, days: str) -> List[list]:
    """Fetch daily OHLC from CoinGecko: returns [timestamp(ms), open, high, low, close] rows."""
    url = f"{COINGECKO_BASE}/coins/{asset_id}/ohlc"
    params = {"vs_currency": "usd", "days": days}
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected OHLC payload: {data!r}")
    return data


def fetch_daily_volumes(asset_id: str, days: str) -> Dict[dt.date, float]:
    """Fetch total volumes via market_chart and map to date -> volume."""
    url = f"{COINGECKO_BASE}/coins/{asset_id}/market_chart"
    params = {"vs_currency": "usd", "days": days}
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    vols = data.get("total_volumes", [])
    out: Dict[dt.date, float] = {}
    for t_ms, v in vols:
        d = dt.datetime.utcfromtimestamp(t_ms / 1000.0).date()
        out[d] = float(v)
    return out


def upsert_ohlc(session: Session, asset: str, interval: str, rows: List[list], volumes_by_date: Dict[dt.date, float] | None = None) -> int:
    total = 0
    for row in rows:
        # [t_ms, o, h, l, c]
        t = dt.datetime.utcfromtimestamp(row[0] / 1000.0)
        o, h, l, c = float(row[1]), float(row[2]), float(row[3]), float(row[4])
        vol = None
        if volumes_by_date is not None:
            vol = volumes_by_date.get(t.date())
        stmt = insert(OHLC).values(
            asset=asset,
            interval=interval,
            ts=t,
            open=o,
            high=h,
            low=l,
            close=c,
            volume=vol,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[OHLC.__table__.c.asset, OHLC.__table__.c.interval, OHLC.__table__.c.ts],
            set_={"open": o, "high": h, "low": l, "close": c, "volume": vol},
        )
        session.execute(stmt)
        total += 1
    return total


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest CoinGecko OHLC (daily)")
    parser.add_argument("--asset-id", required=True, help="CoinGecko asset id, e.g., bitcoin, ethereum")
    parser.add_argument("--days", default="365", help="Days back: 1|7|14|30|90|180|365|max (default: 365)")
    args = parser.parse_args()

    ensure_schema()

    rows = fetch_ohlc_daily(args.asset_id, args.days)
    vols = fetch_daily_volumes(args.asset_id, args.days)
    with Session(engine, future=True) as session:
        count = upsert_ohlc(session, asset=args.asset_id, interval="1d", rows=rows, volumes_by_date=vols)
        session.commit()
        print(f"Upserted {count} OHLCV rows for {args.asset_id} interval=1d")


if __name__ == "__main__":
    main()
