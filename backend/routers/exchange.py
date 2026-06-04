from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import ExchangeRate

router = APIRouter(prefix="/api/exchange", tags=["exchange"])


@router.get("")
def get_exchange(
    days: int = Query(30, ge=1, le=730),
    currency: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(ExchangeRate).filter(ExchangeRate.collected_at >= since)
    if currency:
        q = q.filter(ExchangeRate.currency == currency)
    rows = q.order_by(ExchangeRate.collected_at.asc()).all()
    return [
        {
            "id": r.id,
            "currency": r.currency,
            "rate": r.rate,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/latest")
def get_exchange_latest(db: Session = Depends(get_db)):
    subq = (
        db.query(ExchangeRate.currency, func.max(ExchangeRate.collected_at).label("max_at"))
        .group_by(ExchangeRate.currency)
        .subquery()
    )
    rows = (
        db.query(ExchangeRate)
        .join(
            subq,
            (ExchangeRate.currency == subq.c.currency)
            & (ExchangeRate.collected_at == subq.c.max_at),
        )
        .all()
    )
    return [
        {
            "currency": r.currency,
            "rate": r.rate,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]
