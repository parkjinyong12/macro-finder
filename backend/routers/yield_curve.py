"""
장단기 금리차(수익률 곡선) 엔드포인트.
미국: US10Y - US2Y
한국: KR10Y - KR3Y, KR10Y - KR2Y
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import MacroIndicator

router = APIRouter(prefix="/api/yield-curve", tags=["yield-curve"])

KR_SYMBOLS = ["KR10Y", "KR3Y", "KR2Y"]
US_SYMBOLS  = ["US10Y", "US5Y", "US2Y"]


@router.get("")
def get_yield_curve(days: int = Query(365, ge=1, le=730), db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=days)

    rows = (db.query(MacroIndicator.symbol, MacroIndicator.value,
                     MacroIndicator.collected_at)
            .filter(MacroIndicator.symbol.in_(US_SYMBOLS + KR_SYMBOLS),
                    MacroIndicator.collected_at >= since)
            .order_by(MacroIndicator.collected_at.asc()).all())

    by_date = {}
    for r in rows:
        d = r.collected_at.date().isoformat()
        if d not in by_date:
            by_date[d] = {}
        by_date[d][r.symbol] = r.value

    result = []
    for date in sorted(by_date):
        v = by_date[date]
        us10 = v.get("US10Y")
        us5  = v.get("US5Y")
        us2  = v.get("US2Y")
        kr10 = v.get("KR10Y")
        kr3  = v.get("KR3Y")
        kr2  = v.get("KR2Y")

        us_spread = round(us10 - us2,  3) if us10 is not None and us2  is not None else None
        us_10_5   = round(us10 - us5,  3) if us10 is not None and us5  is not None else None
        us_5_2    = round(us5  - us2,  3) if us5  is not None and us2  is not None else None
        kr_10_3   = round(kr10 - kr3,  3) if kr10 is not None and kr3  is not None else None
        kr_10_2   = round(kr10 - kr2,  3) if kr10 is not None and kr2  is not None else None

        if all(x is None for x in [us_spread, kr_10_3, kr_10_2]):
            continue

        result.append({
            "date":      date,
            "us10y":     us10,
            "us5y":      us5,
            "us2y":      us2,
            "us_spread": us_spread,
            "us_10_5":   us_10_5,
            "us_5_2":    us_5_2,
            "kr10y":     kr10,
            "kr3y":      kr3,
            "kr2y":      kr2,
            "kr_10_3":   kr_10_3,
            "kr_10_2":   kr_10_2,
        })
    return result


@router.get("/latest")
def get_yield_curve_latest(db: Session = Depends(get_db)):
    subq = (db.query(MacroIndicator.symbol,
                     func.max(MacroIndicator.collected_at).label("max_at"))
            .filter(MacroIndicator.symbol.in_(US_SYMBOLS + KR_SYMBOLS))
            .group_by(MacroIndicator.symbol).subquery())
    rows = (db.query(MacroIndicator)
            .join(subq, (MacroIndicator.symbol == subq.c.symbol) &
                  (MacroIndicator.collected_at == subq.c.max_at)).all())

    v = {r.symbol: r.value for r in rows}
    us10 = v.get("US10Y")
    us5  = v.get("US5Y")
    us2  = v.get("US2Y")
    kr10 = v.get("KR10Y")
    kr3  = v.get("KR3Y")
    kr2  = v.get("KR2Y")

    return {
        "us": {
            "us10y":       us10,
            "us5y":        us5,
            "us2y":        us2,
            "spread":      round(us10 - us2,  3) if us10 and us2  else None,
            "spread_10_5": round(us10 - us5,  3) if us10 and us5  else None,
            "spread_5_2":  round(us5  - us2,  3) if us5  and us2  else None,
        },
        "kr": {
            "kr10y":       kr10,
            "kr3y":        kr3,
            "kr2y":        kr2,
            "spread_10_3": round(kr10 - kr3, 3) if kr10 and kr3 else None,
            "spread_10_2": round(kr10 - kr2, 3) if kr10 and kr2 else None,
        },
    }
