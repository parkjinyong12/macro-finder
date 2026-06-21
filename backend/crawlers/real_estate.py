"""
국토교통부 아파트 매매 실거래가 상세 자료 수집
공공데이터포털 API (15126468)
"""
import logging
import os
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, date

from sqlalchemy.orm import Session
from models import RealEstateStat

logger = logging.getLogger(__name__)

API_BASE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"

# 수집 대상 지역 (법정동 코드 앞 5자리 → 지역명)
REGIONS = {
    # 서울
    "11110": "종로구", "11140": "중구",    "11170": "용산구", "11200": "성동구",
    "11215": "광진구", "11230": "동대문구","11260": "중랑구", "11290": "성북구",
    "11305": "강북구", "11320": "도봉구",  "11350": "노원구", "11380": "은평구",
    "11410": "서대문구","11440": "마포구",  "11470": "양천구", "11500": "강서구",
    "11530": "구로구", "11545": "금천구",  "11560": "영등포구","11590": "동작구",
    "11620": "관악구", "11650": "서초구",  "11680": "강남구", "11710": "송파구",
    "11740": "강동구",
    # 경기 주요
    "41135": "성남분당구","41117": "수원영통구","41461": "용인수지구",
    "41285": "고양덕양구","41281": "고양일산동구",
    # 광역시
    "21110": "부산중구",  "27110": "대구중구",
    "28110": "인천중구",  "29110": "광주동구",
    "30110": "대전동구",  "31110": "울산중구",
}


def _parse_price(raw: str) -> float | None:
    try:
        return float(raw.strip().replace(",", ""))
    except (ValueError, AttributeError):
        return None


def _fetch_month(region_code: str, deal_ym: str, service_key: str) -> list[dict]:
    """특정 지역·월의 전체 거래 데이터 반환."""
    records = []
    cancelled = 0
    page = 1
    while True:
        params = urllib.parse.urlencode({
            "serviceKey": service_key,
            "LAWD_CD": region_code,
            "DEAL_YMD": deal_ym,
            "numOfRows": "1000",
            "pageNo": str(page),
        })
        url = f"{API_BASE}?{params}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
        except Exception as e:
            logger.warning("API fetch error %s %s: %s", region_code, deal_ym, e)
            break

        try:
            root = ET.fromstring(body)
        except ET.ParseError as e:
            logger.warning("XML parse error %s %s: %s", region_code, deal_ym, e)
            break

        result_code = root.findtext(".//resultCode", "")
        if result_code not in ("00", "000"):
            result_msg = root.findtext(".//resultMsg", "")
            logger.warning("API error %s %s: %s %s", region_code, deal_ym, result_code, result_msg)
            break

        items = root.findall(".//item")
        if not items:
            break

        for item in items:
            # 계약 해제 건 제외
            if item.findtext("cdealType", "").strip():
                cancelled += 1
                continue

            price_raw = item.findtext("dealAmount", "") or item.findtext("거래금액", "")
            area_raw  = item.findtext("excluUseAr", "") or item.findtext("전용면적", "")
            price = _parse_price(price_raw)
            if price is None:
                continue
            try:
                area = float(area_raw.strip()) if area_raw.strip() else None
            except ValueError:
                area = None

            dealing = item.findtext("dealingGbn", "").strip()   # 중개거래 / 직거래
            buyer   = item.findtext("buyerGbn", "").strip()     # 개인 / 법인 / 공공기관 / 기타
            records.append({"price": price, "area": area, "dealing": dealing, "buyer": buyer})

        total = int(root.findtext(".//totalCount", "0") or 0)
        # totalCount는 해제 건 포함이므로 유효 건수 기준으로 비교
        if len(records) + cancelled >= total:
            break
        page += 1
        time.sleep(0.2)

    return records, cancelled


def _aggregate(records: list[dict], cancelled: int = 0) -> dict:
    if not records:
        return {}
    prices = [r["price"] for r in records]
    areas  = [r["area"] for r in records if r["area"] is not None]
    n = len(records)
    direct_count = sum(1 for r in records if r.get("dealing") == "직거래")
    corp_count   = sum(1 for r in records if r.get("buyer") in ("법인", "공공기관"))
    return {
        "avg_price": sum(prices) / n,
        "max_price": max(prices),
        "min_price": min(prices),
        "trade_count": n,
        "avg_area": sum(areas) / len(areas) if areas else None,
        "direct_deal_ratio": round(direct_count / n * 100, 1),
        "corp_buyer_ratio": round(corp_count / n * 100, 1),
        "cancelled_count": cancelled,
    }


def crawl_real_estate(db: Session, months: int = 12) -> int:
    """최근 N개월치 주요 지역 아파트 매매 통계 수집."""
    service_key = os.getenv("REALESTATE_API_KEY", "")
    if not service_key:
        logger.warning("REALESTATE_API_KEY not set, skipping")
        return 0

    now = datetime.utcnow()
    deal_yms: list[str] = []
    y, m = now.year, now.month
    for _ in range(months):
        deal_yms.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1

    # 이미 수집된 (region_code, deal_ym) 쌍
    existing = {
        (r.region_code, r.deal_ym)
        for r in db.query(RealEstateStat.region_code, RealEstateStat.deal_ym).all()
    }

    inserted = 0
    for ym in deal_yms:
        for code, name in REGIONS.items():
            if (code, ym) in existing:
                continue
            records, cancelled = _fetch_month(code, ym, service_key)
            agg = _aggregate(records, cancelled)
            if not agg:
                continue
            db.add(RealEstateStat(
                region_code=code,
                region_name=name,
                deal_ym=ym,
                avg_price=agg["avg_price"],
                max_price=agg["max_price"],
                min_price=agg["min_price"],
                trade_count=agg["trade_count"],
                avg_area=agg.get("avg_area"),
                direct_deal_ratio=agg.get("direct_deal_ratio"),
                corp_buyer_ratio=agg.get("corp_buyer_ratio"),
                cancelled_count=agg.get("cancelled_count"),
                collected_at=datetime.utcnow(),
            ))
            existing.add((code, ym))
            inserted += 1
            logger.info("RealEstate %s %s: avg=%.0f만원, count=%d, 직거래=%.1f%%, 법인=%.1f%%",
                        name, ym, agg["avg_price"], agg["trade_count"],
                        agg.get("direct_deal_ratio", 0), agg.get("corp_buyer_ratio", 0))
            time.sleep(0.1)
        db.commit()

    logger.info("RealEstate crawl done: %d regions×months inserted", inserted)
    return inserted
