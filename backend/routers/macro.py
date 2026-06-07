from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import MacroIndicator

router = APIRouter(prefix="/api/macro", tags=["macro"])

SYMBOL_META = {
    "KOSPI":   "코스피",
    "VIX":     "VIX 공포지수",
    "DXY":     "달러 인덱스",
    "US10Y":   "미 10년 국채 수익률",
    "FEDRATE": "미국 기준금리",
    "KRRATE":  "한국 기준금리",
}


@router.get("")
def get_macro(
    days: int = Query(30, ge=1, le=730),
    symbol: str = Query(None),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(MacroIndicator).filter(MacroIndicator.collected_at >= since)
    if symbol:
        q = q.filter(MacroIndicator.symbol == symbol)
    rows = q.order_by(MacroIndicator.collected_at.asc()).all()
    return [
        {
            "symbol": r.symbol,
            "name": r.name,
            "value": r.value,
            "open":  r.open_price,
            "high":  r.high_price,
            "low":   r.low_price,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/latest")
def get_macro_latest(db: Session = Depends(get_db)):
    subq = (
        db.query(MacroIndicator.symbol,
                 func.max(MacroIndicator.collected_at).label("max_at"))
        .group_by(MacroIndicator.symbol)
        .subquery()
    )
    rows = (
        db.query(MacroIndicator)
        .join(subq, (MacroIndicator.symbol == subq.c.symbol) &
              (MacroIndicator.collected_at == subq.c.max_at))
        .all()
    )
    return [
        {
            "symbol": r.symbol,
            "name": r.name,
            "value": r.value,
            "open":  r.open_price,
            "high":  r.high_price,
            "low":   r.low_price,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]
