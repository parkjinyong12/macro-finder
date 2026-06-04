import logging
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from models import BondRate

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://finance.naver.com/",
}

# 네이버 금융 지원 금리 코드 → 레이블 매핑
BOND_CODES = {
    "IRR_CD91":    "CD91일",
    "IRR_CALL":    "콜금리",
    "IRR_GOVT03Y": "국고채3Y",
    "IRR_CORP03Y": "회사채3Y",
}


def crawl_bond_rates(db: Session) -> None:
    """네이버 금융 marketindex 에서 주요 금리 수집"""
    now = datetime.utcnow()
    collected = 0

    for code, tenor in BOND_CODES.items():
        try:
            url = f"https://finance.naver.com/marketindex/interestDetail.naver?marketindexCd={code}"
            resp = httpx.get(url, headers=HEADERS, timeout=10, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            # div.today 내 첫 번째 span 값이 현재 금리
            today = soup.select_one("div.today")
            if not today:
                logger.warning("No today div for %s", tenor)
                continue

            spans = [s.get_text(strip=True) for s in today.select("span, em")]
            # 첫 번째 non-empty가 금리값
            rate_text = next((s for s in spans if s and s[0].isdigit()), None)
            if not rate_text:
                logger.warning("Rate value not found for %s: %s", tenor, spans[:5])
                continue

            rate = float(rate_text.replace(",", ""))
            db.add(BondRate(tenor=tenor, rate=rate, collected_at=now))
            collected += 1
        except Exception as e:
            logger.error("Failed to crawl bond rate %s: %s", tenor, e)

    if collected:
        db.commit()
        logger.info("Collected %d bond rates", collected)
