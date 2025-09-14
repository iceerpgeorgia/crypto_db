from __future__ import annotations

import argparse
import datetime as dt
import os
from typing import Dict, List, Tuple

import requests
from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from db import engine
from models import Base, DominancePoint


CMC_BASE = "https://pro-api.coinmarketcap.com"


def _load_env() -> None:
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=False)
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"), override=False)


def fetch_market_caps(symbols: Dict[str, int], start: dt.date, end: dt.date, interval: str, api_key: str) -> Dict[str, List[Tuple[dt.datetime, float]]]:
    """
    Fetch historical market cap for each symbol id and compute time-series.
    Uses CMC v2 /cryptocurrency/quotes/historical (requires paid tiers for long ranges). This is a best-effort
    scaffold: short ranges should work on standard plans. For longer ranges, call in windows.
    Returns map: SYMBOL -> [(ts, market_cap_usd), ...]
    """
    headers = {"X-CMC_PRO_API_KEY": api_key}
    out: Dict[str, List[Tuple[dt.datetime, float]]] = {}
    convert = "USD"
    # Translate interval
    if interval == "daily":
        cmc_interval = "daily"
    elif interval == "hourly":
        cmc_interval = "hourly"
    else:
        raise ValueError("interval must be 'daily' or 'hourly'")

    for sym, cmc_id in symbols.items():
        url = f"{CMC_BASE}/v2/cryptocurrency/quotes/historical"
        params = {
            "id": cmc_id,
            "time_start": start.isoformat(),
            "time_end": end.isoformat(),
            "interval": cmc_interval,
            "convert": convert,
        }
        r = requests.get(url, headers=headers, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        quotes = data.get("data", {}).get("quotes", [])
        series: List[Tuple[dt.datetime, float]] = []
        for q in quotes:
            ts = dt.datetime.fromisoformat(q["timestamp"].replace("Z", "+00:00")).replace(tzinfo=None)
            market_cap = float(q["quote"][convert]["market_cap"])  # type: ignore[index]
            series.append((ts, market_cap))
        out[sym] = series
    return out


def compute_dominance_series(series: Dict[str, List[Tuple[dt.datetime, float]]]) -> Dict[str, List[Tuple[dt.datetime, float]]]:
    """
    Compute dominance % for each symbol per timestamp: dom = 100 * symbol_cap / sum_caps_at_t.
    Align by timestamp (intersection only).
    """
    # Collect intersection of timestamps
    all_ts_sets = [set(ts for ts, _ in s) for s in series.values()]
    common_ts = set.intersection(*all_ts_sets) if all_ts_sets else set()
    out: Dict[str, List[Tuple[dt.datetime, float]]] = {k: [] for k in series}
    for t in sorted(common_ts):
        total = sum(next(v for tt, v in series[sym] if tt == t) for sym in series)
        if total <= 0:
            continue
        for sym in series:
            v = next(v for tt, v in series[sym] if tt == t)
            out[sym].append((t, 100.0 * v / total))
    return out


def upsert_dominance(session: Session, interval: str, dom: Dict[str, List[Tuple[dt.datetime, float]]]) -> int:
    n = 0
    for sym, rows in dom.items():
        for t, close in rows:
            stmt = insert(DominancePoint).values(asset=sym, interval=interval, ts=t, close=close)
            stmt = stmt.on_conflict_do_update(
                index_elements=[DominancePoint.__table__.c.asset, DominancePoint.__table__.c.interval, DominancePoint.__table__.c.ts],
                set_={"close": close},
            )
            session.execute(stmt)
            n += 1
    return n


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)


def main() -> None:
    _load_env()
    parser = argparse.ArgumentParser(description="Ingest CMC dominance (BTC/ETH/USDT)")
    parser.add_argument("--interval", choices=["daily", "hourly"], default="daily")
    parser.add_argument("--start", required=True, help="Start date YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="End date YYYY-MM-DD (inclusive)")
    args = parser.parse_args()

    api_key = os.getenv("CMC_API_KEY")
    if not api_key:
        raise SystemExit("CMC_API_KEY is not set. Export it to run dominance ingestion.")

    start = dt.date.fromisoformat(args.start)
    # CMC treats end as exclusive in some endpoints; keep a day buffer
    end = dt.date.fromisoformat(args.end) + dt.timedelta(days=1)

    ensure_schema()

    # CMC ids: BTC=1, ETH=1027, USDT=825
    symbols = {"BTC": 1, "ETH": 1027, "USDT": 825}
    caps = fetch_market_caps(symbols, start, end, args.interval, api_key)
    dom = compute_dominance_series(caps)

    with Session(engine, future=True) as session:
        n = upsert_dominance(session, args.interval, dom)
        session.commit()
        print(f"Upserted {n} dominance points for {list(symbols.keys())} interval={args.interval}")


if __name__ == "__main__":
    main()

