"""
과거 2년치 데이터 일괄 수집
- 환율 4종: 네이버 금융 exchangeDailyQuote.naver
- 국채 금리 4종: 네이버 금융 interestDailyQuote.naver
- 금 (USD/oz): 네이버 금융 goldDailyQuote.naver col[7]
- WTI·구리·천연가스·은: stock.naver.com /api/securityService (USD)
"""
import logging
import time
from datetime import datetime, timedelta

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from models import BondRate, Commodity, ExchangeRate

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://finance.naver.com/",
}

EXCHANGE_CODES = {
    "FX_USDKRW": "USDKRW",
    "FX_EURKRW": "EURKRW",
    "FX_JPYKRW": "JPYKRW",
    "FX_CNYKRW": "CNYKRW",
}

BOND_CODES = {
    "IRR_CD91":    "CD91일",
    "IRR_CALL":    "콜금리",
    "IRR_GOVT03Y": "국고채3Y",
    "IRR_CORP03Y": "회사채3Y",
}


def _cutoff(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _parse_date(text: str) -> datetime | None:
    try:
        return datetime.strptime(text.strip(), "%Y.%m.%d")
    except ValueError:
        return None


def _scrape_pages(base_url: str, cutoff: datetime, parse_row) -> list[dict]:
    """네이버 일별 시세 페이지를 순회하며 cutoff 이전 날짜까지 수집."""
    results = []
    page = 1
    while True:
        try:
            resp = httpx.get(f"{base_url}&page={page}", headers=HEADERS, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Page %d error: %s", page, e)
            break

        soup = BeautifulSoup(resp.text, "lxml")
        rows = soup.select("table tbody tr")
        if not rows:
            break

        done = False
        for row in rows:
            cols = [td.get_text(strip=True) for td in row.select("td")]
            if not cols or not cols[0]:
                continue
            date = _parse_date(cols[0])
            if date is None:
                continue
            if date < cutoff:
                done = True
                break
            val = parse_row(cols)
            if val is not None:
                results.append({"date": date, "value": val})

        if done:
            break
        page += 1
        time.sleep(0.35)

    return results


# ─── 환율 ────────────────────────────────────────────────────────────────────

def crawl_exchange_history(db: Session, days: int = 730) -> int:
    cutoff = _cutoff(days)
    total = 0

    for code, currency in EXCHANGE_CODES.items():
        existing = {
            r.collected_at.date()
            for r in db.query(ExchangeRate.collected_at)
                       .filter(ExchangeRate.currency == currency).all()
        }
        base_url = (
            "https://finance.naver.com/marketindex/exchangeDailyQuote.naver"
            f"?marketindexCd={code}"
        )

        def parse(cols):
            try:
                return float(cols[1].replace(",", ""))
            except (IndexError, ValueError):
                return None

        rows = _scrape_pages(base_url, cutoff, parse)
        inserted = 0
        for r in rows:
            if r["date"].date() in existing:
                continue
            db.add(ExchangeRate(currency=currency, rate=r["value"],
                                collected_at=r["date"]))
            existing.add(r["date"].date())
            inserted += 1
        db.commit()
        total += inserted
        logger.info("Exchange %s: %d rows", currency, inserted)

    return total


# ─── 국채 금리 ───────────────────────────────────────────────────────────────

def crawl_bonds_history(db: Session, days: int = 730) -> int:
    cutoff = _cutoff(days)
    total = 0

    for code, tenor in BOND_CODES.items():
        existing = {
            r.collected_at.date()
            for r in db.query(BondRate.collected_at)
                       .filter(BondRate.tenor == tenor).all()
        }
        base_url = (
            "https://finance.naver.com/marketindex/interestDailyQuote.naver"
            f"?marketindexCd={code}"
        )

        def parse(cols):
            try:
                return float(cols[1].replace(",", ""))
            except (IndexError, ValueError):
                return None

        rows = _scrape_pages(base_url, cutoff, parse)
        inserted = 0
        for r in rows:
            if r["date"].date() in existing:
                continue
            db.add(BondRate(tenor=tenor, rate=r["value"],
                            collected_at=r["date"]))
            existing.add(r["date"].date())
            inserted += 1
        db.commit()
        total += inserted
        logger.info("Bond %s: %d rows", tenor, inserted)

    return total


# ─── 금 (국제 금 시세 USD/oz) ─────────────────────────────────────────────────

def crawl_gold_history(db: Session, days: int = 730) -> int:
    """네이버 금융 goldDailyQuote — col[7] = 기준 국제 금 시세 (USD/oz)"""
    cutoff = _cutoff(days)
    existing = {
        r.collected_at.date()
        for r in db.query(Commodity.collected_at)
                   .filter(Commodity.symbol == "GC=F").all()
    }
    base_url = "https://finance.naver.com/marketindex/goldDailyQuote.naver?"

    def parse(cols):
        try:
            return float(cols[7].replace(",", ""))  # 기준 국제 금 시세 (USD/oz)
        except (IndexError, ValueError):
            return None

    rows = _scrape_pages(base_url, cutoff, parse)
    inserted = 0
    for r in rows:
        if r["date"].date() in existing:
            continue
        db.add(Commodity(
            symbol="GC=F",
            name="금",
            price=r["value"],
            currency="USD",
            collected_at=r["date"],
        ))
        existing.add(r["date"].date())
        inserted += 1
    db.commit()
    logger.info("Gold history: %d rows", inserted)
    return inserted


# ─── WTI·구리·천연가스·은 (stock.naver.com API) ──────────────────────────────

# (Naver stock category, Naver code) → (DB symbol, 한글명)
STOCK_NAVER_SYMBOLS = {
    ("energy",  "CLcv1"): ("CL=F", "WTI 원유"),
    ("metals",  "HGcv1"): ("HG=F", "구리"),
    ("energy",  "NGcv1"): ("NG=F", "천연가스"),
    ("metals",  "SIcv1"): ("SI=F", "은"),
}

_STOCK_NAVER_BASE = "https://stock.naver.com"
_STOCK_NAVER_REFERER = "https://stock.naver.com/marketindex/energy/CLcv1/price"


def crawl_stock_naver_history(db: Session, days: int = 730) -> int:
    """stock.naver.com /api/securityService 에서 선물 상품 가격 수집 (USD)."""
    cutoff = _cutoff(days)
    total = 0

    for (cat, code), (db_sym, name) in STOCK_NAVER_SYMBOLS.items():
        existing = {
            r.collected_at.date()
            for r in db.query(Commodity.collected_at)
                       .filter(Commodity.symbol == db_sym).all()
        }
        inserted = 0
        page = 1
        done = False

        while not done:
            url = (
                f"{_STOCK_NAVER_BASE}/api/securityService/marketindex"
                f"/{cat}/{code}/prices?page={page}&pageSize=20"
            )
            try:
                resp = httpx.get(
                    url,
                    headers={**HEADERS, "Referer": _STOCK_NAVER_REFERER},
                    timeout=15,
                )
                resp.raise_for_status()
                rows = resp.json()
            except Exception as e:
                logger.warning("%s page %d error: %s", db_sym, page, e)
                break

            if not isinstance(rows, list) or not rows:
                break

            for row in rows:
                traded_at_str = row.get("localTradedAt", "")
                close_str = row.get("closePrice", "")
                if not traded_at_str or not close_str:
                    continue
                # localTradedAt: "2026-05-22T16:00:00-05:00"
                date = datetime.fromisoformat(traded_at_str).replace(tzinfo=None)
                date = date.replace(hour=0, minute=0, second=0, microsecond=0)
                if date < cutoff:
                    done = True
                    break
                if date.date() in existing:
                    continue
                try:
                    price = float(close_str.replace(",", ""))
                except ValueError:
                    continue
                db.add(Commodity(
                    symbol=db_sym,
                    name=name,
                    price=price,
                    currency="USD",
                    collected_at=date,
                ))
                existing.add(date.date())
                inserted += 1

            page += 1
            time.sleep(0.3)

        db.commit()
        total += inserted
        logger.info("%s (%s): %d rows", name, db_sym, inserted)

    return total


# ─── 전체 실행 ────────────────────────────────────────────────────────────────

def crawl_all_history(db: Session, days: int = 730) -> dict:
    logger.info("Historical collection started (%d days)...", days)
    from crawlers.macro_indicators import crawl_all_macro
    result = {
        "exchange": crawl_exchange_history(db, days),
        "bonds": crawl_bonds_history(db, days),
        "gold": crawl_gold_history(db, days),
        "commodities": crawl_stock_naver_history(db, days),
        "macro": crawl_all_macro(db, days),
    }
    logger.info("Historical collection done: %s", result)
    return result
