from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Commodity

router = APIRouter(prefix="/api/commodities", tags=["commodities"])


@router.get("")
def get_commodities(
    days: int = Query(30, ge=1, le=730),
    symbol: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(Commodity).filter(Commodity.collected_at >= since)
    if symbol:
        q = q.filter(Commodity.symbol == symbol)
    rows = q.order_by(Commodity.collected_at.asc()).all()
    return [
        {
            "id": r.id,
            "symbol": r.symbol,
            "name": r.name,
            "price": r.price,
            "currency": r.currency,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/latest")
def get_commodities_latest(db: Session = Depends(get_db)):
    subq = (
        db.query(Commodity.symbol, func.max(Commodity.collected_at).label("max_at"))
        .group_by(Commodity.symbol)
        .subquery()
    )
    rows = (
        db.query(Commodity)
        .join(
            subq,
            (Commodity.symbol == subq.c.symbol) & (Commodity.collected_at == subq.c.max_at),
        )
        .all()
    )
    return [
        {
            "symbol": r.symbol,
            "name": r.name,
            "price": r.price,
            "currency": r.currency,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]
