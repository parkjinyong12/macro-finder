import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from models import Commodity

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://stock.naver.com/marketindex/energy/CLcv1/price",
}

# (stock.naver category, code) → (DB symbol, 한글명)
SYMBOLS = {
    ("metals", "GCcv1"): ("GC=F", "금"),
    ("energy", "CLcv1"): ("CL=F", "WTI 원유"),
    ("metals", "HGcv1"): ("HG=F", "구리"),
    ("metals", "SIcv1"): ("SI=F", "은"),
    ("energy", "NGcv1"): ("NG=F", "천연가스"),
}

_BASE = "https://stock.naver.com/api/securityService/marketindex"


def _fetch_latest(cat: str, code: str) -> float | None:
    url = f"{_BASE}/{cat}/{code}/prices?page=1&pageSize=1"
    resp = httpx.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    rows = resp.json()
    if not isinstance(rows, list) or not rows:
        return None
    close = rows[0].get("closePrice", "")
    return float(close.replace(",", "")) if close else None


def crawl_commodities(db: Session) -> None:
    now = datetime.utcnow()
    collected = 0

    for (cat, code), (db_sym, name) in SYMBOLS.items():
        try:
            price = _fetch_latest(cat, code)
            if price is None:
                logger.warning("No price for %s (%s)", name, code)
                continue
            db.add(Commodity(
                symbol=db_sym,
                name=name,
                price=price,
                currency="USD",
                collected_at=now,
            ))
            collected += 1
        except Exception as e:
            logger.error("Commodity %s failed: %s", name, e)

    if collected:
        db.commit()
        logger.info("Collected %d commodity prices", collected)
