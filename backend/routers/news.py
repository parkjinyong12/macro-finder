from collections import defaultdict

from fastapi import APIRouter, Depends, Query, BackgroundTasks
from typing import Optional
from sqlalchemy.orm import Session

from database import get_db
from models import TechNews
from crawlers.tech_news import translate_pending
from crawlers.theme_classifier import classify_pending

router = APIRouter(prefix="/api/news", tags=["news"])


def _row_dict(r):
    return {
        "id": r.id,
        "title": r.title,
        "title_ko": r.title_ko,
        "theme": r.theme,
        "url": r.url,
        "source": r.source,
        "published_at": r.published_at.isoformat() if r.published_at else None,
        "collected_at": r.collected_at.isoformat(),
    }


@router.get("")
def get_news(
    limit: int = Query(50, ge=1, le=200),
    source: Optional[str] = Query(None),
    theme: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TechNews)
    if source:
        q = q.filter(TechNews.source == source)
    if theme:
        q = q.filter(TechNews.theme == theme)
    rows = q.order_by(TechNews.published_at.desc().nullslast()).limit(limit).all()
    return [_row_dict(r) for r in rows]


@router.get("/grouped")
def get_news_grouped(
    limit: int = Query(100, ge=1, le=200),
    source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """테마별로 그룹화된 뉴스 반환"""
    q = db.query(TechNews)
    if source:
        q = q.filter(TechNews.source == source)
    rows = q.order_by(TechNews.published_at.desc().nullslast()).limit(limit).all()

    groups: dict[str, list] = defaultdict(list)
    for r in rows:
        key = r.theme or "기타"
        groups[key].append(_row_dict(r))

    # Sort themes: known order first, then 기타 last
    THEME_ORDER = [
        "AI/머신러닝", "반도체/하드웨어", "소프트웨어/클라우드",
        "빅테크/기업", "스타트업/투자", "보안/프라이버시",
        "에너지/환경", "우주/항공", "바이오/헬스케어", "기타",
    ]
    ordered = []
    seen = set()
    for t in THEME_ORDER:
        if t in groups:
            ordered.append({"theme": t, "items": groups[t]})
            seen.add(t)
    for t in groups:
        if t not in seen:
            ordered.append({"theme": t, "items": groups[t]})
    return ordered


@router.get("/sources")
def get_sources(db: Session = Depends(get_db)):
    rows = db.query(TechNews.source).distinct().all()
    return [r.source for r in rows]


@router.get("/themes")
def get_themes(db: Session = Depends(get_db)):
    rows = db.query(TechNews.theme).filter(TechNews.theme.isnot(None)).distinct().all()
    return [r.theme for r in rows]


@router.post("/translate-pending")
def run_translate_pending(
    background_tasks: BackgroundTasks,
    batch_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    background_tasks.add_task(translate_pending, db, batch_size)
    pending = db.query(TechNews).filter(TechNews.title_ko.is_(None)).count()
    return {"status": "started", "pending_count": pending}


@router.post("/classify-pending")
def run_classify_pending(
    background_tasks: BackgroundTasks,
    batch_size: int = Query(60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    background_tasks.add_task(classify_pending, db, batch_size)
    pending = db.query(TechNews).filter(TechNews.theme.is_(None)).count()
    return {"status": "started", "pending_count": pending}
