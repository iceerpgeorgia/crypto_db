# Crypto DB Ingestion (Python)

Lightweight ingestion scripts to populate PostgreSQL with crypto OHLC and dominance data.

## Setup
- Python 3.10+
- PostgreSQL reachable via `DATABASE_URL`.
- Install deps: `pip install -r python/requirements.txt`
- Env: copy `.env.example` to `.env` at repo root or in `python/`.

## Environment
- `DATABASE_URL` (required): e.g. `postgresql+psycopg2://postgres:password@localhost:5432/crypto_db`
- `CMC_API_KEY` (optional): CoinMarketCap API key for dominance ingestion.

## Commands
- CoinGecko OHLC (daily):
  - `python python/ingest_cg_ohlc.py --asset-id bitcoin --days 365`
- CMC Dominance (daily/hourly):
  - `python python/ingest_cmc_dominance.py --interval daily --start 2022-01-01 --end 2023-01-01`

Notes
- CoinGecko OHLC endpoint supports daily candles (days=1|7|14|30|90|180|365|max). Hourly not supported via OHLC; use market chart if needed.
- Upserts use Postgres ON CONFLICT for idempotent re-runs.

