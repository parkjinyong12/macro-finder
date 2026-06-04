from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import BondRate

router = APIRouter(prefix="/api/bonds", tags=["bonds"])


@router.get("")
def get_bonds(
    days: int = Query(30, ge=1, le=730),
    tenor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(BondRate).filter(BondRate.collected_at >= since)
    if tenor:
        q = q.filter(BondRate.tenor == tenor)
    rows = q.order_by(BondRate.collected_at.asc()).all()
    return [
        {
            "id": r.id,
            "tenor": r.tenor,
            "rate": r.rate,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/latest")
def get_bonds_latest(db: Session = Depends(get_db)):
    subq = (
        db.query(BondRate.tenor, func.max(BondRate.collected_at).label("max_at"))
        .group_by(BondRate.tenor)
        .subquery()
    )
    rows = (
        db.query(BondRate)
        .join(subq, (BondRate.tenor == subq.c.tenor) & (BondRate.collected_at == subq.c.max_at))
        .all()
    )
    return [
        {"tenor": r.tenor, "rate": r.rate, "collected_at": r.collected_at.isoformat()}
        for r in rows
    ]
