"""
추가 매크로 지표 수집:
- KOSPI (Yahoo Finance ^KS11)
- VIX (Naver /api/securityService/index/.VIX/price)
- Dollar Index (Yahoo Finance DX-Y.NYB)
- US 10Y Treasury Yield (Yahoo Finance ^TNX)
- 미국 기준금리 FEDRATE (Naver standardInterest USA calendars)
- 한국 기준금리 KRRATE (Naver standardInterest KOR calendars)
"""
import logging
import time
import urllib.request
import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from models import MacroIndicator

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}

YAHOO_SYMBOLS = {
    "^KS11":    ("KOSPI",  "코스피"),
    "DX-Y.NYB": ("DXY",    "달러 인덱스"),
    "^TNX":     ("US10Y",  "미 10년 국채 수익률"),
    "^GSPC":    ("SPX",    "S&P 500"),
    "^IXIC":    ("NASDAQ", "나스닥"),
    "JPY=X":    ("USDJPY", "달러/엔"),
}

NAVER_CENTRAL_BANKS = {
    "USA": ("FEDRATE", "미국 기준금리"),
    "KOR": ("KRRATE", "한국 기준금리"),
}

# Naver bond API: /api/securityService/marketindex/bond/{encoded_code}/prices
NAVER_BONDS = {
    "US2YT%3DRR":  ("US2Y",  "미 2년 국채 수익률"),
    "US5YT%3DRR":  ("US5Y",  "미 5년 국채 수익률"),
    "KR10YT%3DRR": ("KR10Y", "한국 국채 10년"),
    "KR3YT%3DRR":  ("KR3Y",  "한국 국채 3년"),
    "KR2YT%3DRR":  ("KR2Y",  "한국 국채 2년"),
}

_NAVER_BASE = "https://stock.naver.com"
_NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://stock.naver.com/",
}


def _cutoff(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


# ─── Yahoo Finance ─────────────────────────────────────────────────────────────

def _yahoo_fetch(ticker: str, days: int) -> list[dict]:
    """Yahoo Finance v8 API에서 일별 OHLC 데이터 반환."""
    import urllib.parse
    encoded = urllib.parse.quote(ticker)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?interval=1d&range=2y"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        result = data["chart"]["result"][0]
        timestamps = result["timestamp"]
        quote = result["indicators"]["quote"][0]
        opens  = quote.get("open",  [None] * len(timestamps))
        highs  = quote.get("high",  [None] * len(timestamps))
        lows   = quote.get("low",   [None] * len(timestamps))
        closes = quote.get("close", [None] * len(timestamps))
        cutoff = _cutoff(days)
        rows = []
        for ts, o, h, l, c in zip(timestamps, opens, highs, lows, closes):
            if c is None:
                continue
            dt = datetime.utcfromtimestamp(ts).replace(hour=0, minute=0, second=0)
            if dt < cutoff:
                continue
            rows.append({"date": dt, "value": c, "open": o, "high": h, "low": l})
        return rows
    except Exception as e:
        logger.warning("Yahoo fetch %s error: %s", ticker, e)
        return []


def crawl_yahoo_history(db: Session, days: int = 730) -> int:
    total = 0
    for ticker, (symbol, name) in YAHOO_SYMBOLS.items():
        existing = {
            r.collected_at.date()
            for r in db.query(MacroIndicator.collected_at)
                       .filter(MacroIndicator.symbol == symbol).all()
        }
        rows = _yahoo_fetch(ticker, days)
        inserted = 0
        for r in rows:
            if r["date"].date() in existing:
                continue
            db.add(MacroIndicator(symbol=symbol, name=name,
                                  value=r["value"],
                                  open_price=r.get("open"),
                                  high_price=r.get("high"),
                                  low_price=r.get("low"),
                                  collected_at=r["date"]))
            existing.add(r["date"].date())
            inserted += 1
        db.commit()
        logger.info("%s (%s): %d rows", name, symbol, inserted)
        total += inserted
        time.sleep(0.5)
    return total


# ─── Naver VIX ────────────────────────────────────────────────────────────────

def _naver_vix_fetch(days: int) -> list[dict]:
    cutoff = _cutoff(days)
    results = []
    page = 1
    while True:
        url = f"{_NAVER_BASE}/api/securityService/index/.VIX/price?page={page}&pageSize=20"
        req = urllib.request.Request(url, headers=_NAVER_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                rows = json.loads(resp.read())
        except Exception as e:
            logger.warning("Naver VIX page %d error: %s", page, e)
            break

        if not isinstance(rows, list) or not rows:
            break

        done = False
        for row in rows:
            traded_at = row.get("localTradedAt", "")
            price_str = row.get("closePrice", "")
            if not traded_at or not price_str:
                continue
            try:
                dt = datetime.fromisoformat(traded_at).replace(tzinfo=None)
                dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                price = float(price_str)
            except (ValueError, TypeError):
                continue
            if dt < cutoff:
                done = True
                break
            results.append({
                "date": dt,
                "value": price,
                "open":  _flt(row.get("openPrice")),
                "high":  _flt(row.get("highPrice")),
                "low":   _flt(row.get("lowPrice")),
            })

        if done:
            break
        page += 1
        time.sleep(0.3)

    return results


def _flt(v):
    try:
        return float(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def crawl_naver_vix(db: Session, days: int = 730) -> int:
    existing = {
        r.collected_at.date()
        for r in db.query(MacroIndicator.collected_at)
                   .filter(MacroIndicator.symbol == "VIX").all()
    }
    rows = _naver_vix_fetch(days)
    inserted = 0
    for r in rows:
        if r["date"].date() in existing:
            continue
        db.add(MacroIndicator(symbol="VIX", name="VIX 공포지수",
                              value=r["value"],
                              open_price=r.get("open"),
                              high_price=r.get("high"),
                              low_price=r.get("low"),
                              collected_at=r["date"]))
        existing.add(r["date"].date())
        inserted += 1
    db.commit()
    logger.info("VIX (Naver): %d rows", inserted)
    return inserted


# ─── Naver 기준금리 calendars ──────────────────────────────────────────────────

def _naver_calendars_fetch(nation: str, days: int) -> list[dict]:
    cutoff = _cutoff(days)
    results = []
    page = 1
    while True:
        url = (f"{_NAVER_BASE}/api/securityService/marketindex/standardInterest"
               f"/{nation}/calendars?page={page}&pageSize=50")
        req = urllib.request.Request(url, headers=_NAVER_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                rows = json.loads(resp.read())
        except Exception as e:
            logger.warning("Naver calendars %s page %d error: %s", nation, page, e)
            break

        if not isinstance(rows, list) or not rows:
            break

        done = False
        for row in rows:
            if not row.get("isRelease"):
                continue
            traded_at = row.get("localTradedAt", "")
            price_str = row.get("closePrice", "")
            if not traded_at or not price_str or price_str == "-":
                continue
            try:
                dt = datetime.fromisoformat(traded_at).replace(tzinfo=None)
                price = float(price_str)
            except (ValueError, TypeError):
                continue
            dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
            if dt < cutoff:
                done = True
                break
            results.append({"date": dt, "value": price})

        if done:
            break
        page += 1
        time.sleep(0.3)

    return results


# ─── Naver Bond API (US2Y 등) ─────────────────────────────────────────────────

def crawl_naver_bonds(db: Session, days: int = 730) -> int:
    """Naver bond API에서 국채 수익률 수집 (US2Y 등)."""
    cutoff = _cutoff(days)
    total = 0

    for encoded_code, (symbol, name) in NAVER_BONDS.items():
        existing = {
            r.collected_at.date()
            for r in db.query(MacroIndicator.collected_at)
                       .filter(MacroIndicator.symbol == symbol).all()
        }
        inserted = 0
        page = 1
        done = False

        while not done:
            url = (f"{_NAVER_BASE}/api/securityService/marketindex"
                   f"/bond/{encoded_code}/prices?page={page}&pageSize=20")
            req = urllib.request.Request(url, headers=_NAVER_HEADERS)
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    rows = json.loads(resp.read())
            except Exception as e:
                logger.warning("%s page %d error: %s", symbol, page, e)
                break

            if not isinstance(rows, list) or not rows:
                break

            for row in rows:
                traded_at = row.get("localTradedAt", "")
                price_str = row.get("closePrice", "")
                if not traded_at or not price_str:
                    continue
                try:
                    dt = datetime.fromisoformat(traded_at).replace(tzinfo=None)
                    dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                    price = float(price_str)
                except (ValueError, TypeError):
                    continue
                if dt < cutoff:
                    done = True
                    break
                if dt.date() in existing:
                    continue
                db.add(MacroIndicator(symbol=symbol, name=name,
                                      value=price,
                                      open_price=_flt(row.get("openPrice")),
                                      high_price=_flt(row.get("highPrice")),
                                      low_price=_flt(row.get("lowPrice")),
                                      collected_at=dt))
                existing.add(dt.date())
                inserted += 1

            page += 1
            time.sleep(0.3)

        db.commit()
        logger.info("%s (%s): %d rows", name, symbol, inserted)
        total += inserted

    return total


def crawl_central_bank_rates(db: Session, days: int = 730) -> int:
    total = 0
    for nation, (symbol, name) in NAVER_CENTRAL_BANKS.items():
        existing = {
            r.collected_at.date()
            for r in db.query(MacroIndicator.collected_at)
                       .filter(MacroIndicator.symbol == symbol).all()
        }
        rows = _naver_calendars_fetch(nation, days)
        inserted = 0
        for r in rows:
            if r["date"].date() in existing:
                continue
            db.add(MacroIndicator(symbol=symbol, name=name,
                                  value=r["value"], collected_at=r["date"]))
            existing.add(r["date"].date())
            inserted += 1
        db.commit()
        logger.info("%s (%s): %d rows", name, symbol, inserted)
        total += inserted
    return total


# ─── 최신값 단건 ──────────────────────────────────────────────────────────────

def crawl_macro_latest(db: Session) -> int:
    """최신값만 빠르게 갱신 (스케줄러 30분 배치용)."""
    updated = 0

    # Yahoo
    for ticker, (symbol, name) in YAHOO_SYMBOLS.items():
        import urllib.parse
        encoded = urllib.parse.quote(ticker)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?interval=1d&range=5d"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            result = data["chart"]["result"][0]
            ts = result["timestamp"]
            quote = result["indicators"]["quote"][0]
            opens  = quote.get("open",  [])
            highs  = quote.get("high",  [])
            lows   = quote.get("low",   [])
            closes = quote.get("close", [])
            for i, (t, c) in reversed(list(enumerate(zip(ts, closes)))):
                if c is not None:
                    dt = datetime.utcfromtimestamp(t).replace(
                        hour=0, minute=0, second=0, microsecond=0)
                    existing = db.query(MacroIndicator).filter(
                        MacroIndicator.symbol == symbol,
                        MacroIndicator.collected_at == dt,
                    ).first()
                    if not existing:
                        db.add(MacroIndicator(
                            symbol=symbol, name=name, value=c,
                            open_price=opens[i] if i < len(opens) else None,
                            high_price=highs[i] if i < len(highs) else None,
                            low_price=lows[i]  if i < len(lows)  else None,
                            collected_at=dt,
                        ))
                        updated += 1
                    break
        except Exception as e:
            logger.warning("Yahoo latest %s error: %s", ticker, e)
        time.sleep(0.3)

    # Naver bonds (US2Y 등)
    for encoded_code, (symbol, name) in NAVER_BONDS.items():
        url = (f"{_NAVER_BASE}/api/securityService/marketindex"
               f"/bond/{encoded_code}/prices?page=1&pageSize=3")
        req = urllib.request.Request(url, headers=_NAVER_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows = json.loads(resp.read())
            if rows:
                row = rows[0]
                traded_at = row.get("localTradedAt", "")
                price_str = row.get("closePrice", "")
                if traded_at and price_str:
                    dt = datetime.fromisoformat(traded_at).replace(tzinfo=None)
                    dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                    existing = db.query(MacroIndicator).filter(
                        MacroIndicator.symbol == symbol,
                        MacroIndicator.collected_at == dt,
                    ).first()
                    if not existing:
                        db.add(MacroIndicator(symbol=symbol, name=name,
                                              value=float(price_str),
                                              open_price=_flt(row.get("openPrice")),
                                              high_price=_flt(row.get("highPrice")),
                                              low_price=_flt(row.get("lowPrice")),
                                              collected_at=dt))
                        updated += 1
        except Exception as e:
            logger.warning("Naver bond latest %s error: %s", symbol, e)

    # Naver central banks
    for nation, (symbol, name) in NAVER_CENTRAL_BANKS.items():
        url = (f"{_NAVER_BASE}/api/securityService/marketindex"
               f"/standardInterest/{nation}")
        req = urllib.request.Request(url, headers=_NAVER_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                row = json.loads(resp.read())
            traded_at = row.get("localTradedAt", "")
            price_str = row.get("closePrice", "")
            if traded_at and price_str:
                dt = datetime.fromisoformat(traded_at).replace(tzinfo=None)
                dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                existing = db.query(MacroIndicator).filter(
                    MacroIndicator.symbol == symbol,
                    MacroIndicator.collected_at == dt,
                ).first()
                if not existing:
                    db.add(MacroIndicator(symbol=symbol, name=name,
                                          value=float(price_str), collected_at=dt))
                    updated += 1
        except Exception as e:
            logger.warning("Naver latest %s error: %s", nation, e)

    # Naver VIX latest
    url = f"{_NAVER_BASE}/api/securityService/index/.VIX/price?page=1&pageSize=3"
    req = urllib.request.Request(url, headers=_NAVER_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read())
        if rows:
            row = rows[0]
            traded_at = row.get("localTradedAt", "")
            price_str = row.get("closePrice", "")
            if traded_at and price_str:
                dt = datetime.fromisoformat(traded_at).replace(tzinfo=None)
                dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                existing = db.query(MacroIndicator).filter(
                    MacroIndicator.symbol == "VIX",
                    MacroIndicator.collected_at == dt,
                ).first()
                if not existing:
                    db.add(MacroIndicator(symbol="VIX", name="VIX 공포지수",
                                          value=float(price_str), collected_at=dt))
                    updated += 1
    except Exception as e:
        logger.warning("Naver VIX latest error: %s", e)

    db.commit()
    logger.info("Macro latest update: %d new rows", updated)
    return updated


def crawl_all_macro(db: Session, days: int = 730) -> dict:
    logger.info("Macro indicators collection started (%d days)...", days)
    return {
        "yahoo": crawl_yahoo_history(db, days),
        "central_banks": crawl_central_bank_rates(db, days),
        "naver_bonds": crawl_naver_bonds(db, days),
        "naver_vix": crawl_naver_vix(db, days),
    }
