from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import RealEstateStat

router = APIRouter(prefix="/api/realestate", tags=["realestate"])

REGION_GROUPS = {
    "서울": [
        "11110","11140","11170","11200","11215","11230","11260","11290",
        "11305","11320","11350","11380","11410","11440","11470","11500",
        "11530","11545","11560","11590","11620","11650","11680","11710","11740",
    ],
    "경기": ["41135","41117","41461","41285","41281"],
    "광역시": ["21110","27110","28110","29110","30110","31110"],
}


@router.get("/stats")
def get_stats(
    region_code: str = Query(None, description="법정동 코드 5자리"),
    months: int = Query(12, ge=1, le=36),
    db: Session = Depends(get_db),
):
    """지역별 월별 통계 목록."""
    q = db.query(RealEstateStat)
    if region_code:
        q = q.filter(RealEstateStat.region_code == region_code)
    rows = q.order_by(RealEstateStat.deal_ym.desc()).limit(months * 50).all()
    return [
        {
            "region_code": r.region_code,
            "region_name": r.region_name,
            "deal_ym": r.deal_ym,
            "avg_price": r.avg_price,
            "max_price": r.max_price,
            "min_price": r.min_price,
            "trade_count": r.trade_count,
            "avg_area": r.avg_area,
            "direct_deal_ratio": r.direct_deal_ratio,
            "corp_buyer_ratio": r.corp_buyer_ratio,
            "cancelled_count": r.cancelled_count,
        }
        for r in rows
    ]


@router.get("/regions")
def get_regions(db: Session = Depends(get_db)):
    """수집된 지역 목록."""
    rows = (
        db.query(RealEstateStat.region_code, RealEstateStat.region_name)
        .distinct()
        .order_by(RealEstateStat.region_code)
        .all()
    )
    return [{"code": r.region_code, "name": r.region_name} for r in rows]


@router.get("/summary")
def get_summary(
    deal_ym: str = Query(None, description="YYYYMM"),
    db: Session = Depends(get_db),
):
    """특정 월 전체 지역 요약."""
    if not deal_ym:
        latest = db.query(func.max(RealEstateStat.deal_ym)).scalar()
        deal_ym = latest or ""
    rows = (
        db.query(RealEstateStat)
        .filter(RealEstateStat.deal_ym == deal_ym)
        .order_by(RealEstateStat.avg_price.desc())
        .all()
    )
    return {
        "deal_ym": deal_ym,
        "regions": [
            {
                "region_code": r.region_code,
                "region_name": r.region_name,
                "avg_price": r.avg_price,
                "max_price": r.max_price,
                "trade_count": r.trade_count,
                "avg_area": r.avg_area,
                "direct_deal_ratio": r.direct_deal_ratio,
                "corp_buyer_ratio": r.corp_buyer_ratio,
                "cancelled_count": r.cancelled_count,
            }
            for r in rows
        ],
    }


@router.get("/trend")
def get_trend(
    codes: str = Query(..., description="콤마 구분 지역코드, 최대 5개"),
    months: int = Query(12, ge=1, le=36),
    db: Session = Depends(get_db),
):
    """복수 지역 월별 평균가 추세."""
    code_list = [c.strip() for c in codes.split(",")][:5]
    rows = (
        db.query(RealEstateStat)
        .filter(RealEstateStat.region_code.in_(code_list))
        .order_by(RealEstateStat.deal_ym.asc())
        .all()
    )
    # 월별 → 지역별 딕셔너리로 재구성
    data: dict[str, dict] = {}
    for r in rows:
        if r.deal_ym not in data:
            data[r.deal_ym] = {"deal_ym": r.deal_ym}
        data[r.deal_ym][r.region_code] = {
            "avg_price": r.avg_price,
            "trade_count": r.trade_count,
            "direct_deal_ratio": r.direct_deal_ratio,
            "corp_buyer_ratio": r.corp_buyer_ratio,
            "cancelled_count": r.cancelled_count,
        }
    return {"codes": code_list, "months": sorted(data.values(), key=lambda x: x["deal_ym"])}


@router.post("/crawl")
def trigger_crawl(background_tasks: BackgroundTasks):
    """수동 수집 트리거."""
    def _run():
        from crawlers.real_estate import crawl_real_estate
        db = SessionLocal()
        try:
            crawl_real_estate(db, months=12)
        finally:
            db.close()

    background_tasks.add_task(_run)
    return {"status": "started"}
