import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Prediction
from crawlers.predictor import run_prediction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.get("")
def get_predictions(db: Session = Depends(get_db)):
    """가장 최근 예측 세트 반환 (created_at 기준 마지막 배치)."""
    latest_time = db.query(func.max(Prediction.created_at)).scalar()
    if not latest_time:
        return []
    rows = db.query(Prediction).filter(Prediction.created_at == latest_time).all()
    return [
        {
            "symbol": r.target_symbol,
            "name": r.target_name,
            "direction": r.direction,
            "explanation": r.explanation,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/run")
def trigger_prediction(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """수동으로 예측 즉시 실행."""
    def _run():
        from database import SessionLocal
        session = SessionLocal()
        try:
            run_prediction(session)
        except Exception as e:
            logger.error("Prediction run failed: %s", e)
        finally:
            session.close()

    background_tasks.add_task(_run)
    return {"status": "prediction started"}
