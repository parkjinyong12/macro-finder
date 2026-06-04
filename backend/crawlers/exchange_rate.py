import logging
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from models import ExchangeRate

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


def crawl_exchange_rates(db: Session) -> None:
    """네이버 금융에서 환율 수집"""
    now = datetime.utcnow()
    collected = 0

    for code, currency in EXCHANGE_CODES.items():
        try:
            url = f"https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd={code}"
            resp = httpx.get(url, headers=HEADERS, timeout=10, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            today = soup.select_one("div.today")
            if not today:
                logger.warning("No today div for %s", currency)
                continue

            spans = [s.get_text(strip=True) for s in today.select("span, em")]
            rate_text = next(
                (s for s in spans if s and (s[0].isdigit() or s.startswith(","))), None
            )
            if not rate_text:
                logger.warning("Rate not found for %s: %s", currency, spans[:5])
                continue

            rate = float(rate_text.replace(",", ""))
            db.add(ExchangeRate(currency=currency, rate=rate, collected_at=now))
            collected += 1
        except Exception as e:
            logger.error("Failed to crawl exchange rate %s: %s", currency, e)

    if collected:
        db.commit()
        logger.info("Collected %d exchange rates", collected)
