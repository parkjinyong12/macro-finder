import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import func

from database import SessionLocal
from crawlers.naver_finance import crawl_bond_rates
from crawlers.exchange_rate import crawl_exchange_rates
from crawlers.commodities import crawl_commodities
from crawlers.tech_news import crawl_tech_news
from crawlers.historical import crawl_all_history
from crawlers.macro_indicators import crawl_macro_latest, crawl_all_macro
from crawlers.predictor import run_prediction
from crawlers.real_estate import crawl_real_estate

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="Asia/Seoul")

job_last_run: dict[str, datetime | None] = {
    "bonds": None,
    "exchange": None,
    "commodities": None,
    "news": None,
    "history": None,
    "macro": None,
    "predictions": None,
    "realestate": None,
}


def _run_with_session(job_name: str, func):
    db = SessionLocal()
    try:
        func(db)
        job_last_run[job_name] = datetime.utcnow()
    except Exception as e:
        logger.error("Job %s failed: %s", job_name, e)
    finally:
        db.close()


def job_bonds():
    _run_with_session("bonds", crawl_bond_rates)


def job_exchange():
    _run_with_session("exchange", crawl_exchange_rates)


def job_commodities():
    _run_with_session("commodities", crawl_commodities)


def job_news():
    _run_with_session("news", crawl_tech_news)


def job_history():
    _run_with_session("history", crawl_all_history)


def job_macro():
    _run_with_session("macro", crawl_macro_latest)


def job_predictions():
    _run_with_session("predictions", run_prediction)


def job_realestate():
    _run_with_session("realestate", lambda db: crawl_real_estate(db, months=2))


JOB_MAP = {
    "bonds": job_bonds,
    "exchange": job_exchange,
    "commodities": job_commodities,
    "news": job_news,
    "history": job_history,
    "macro": job_macro,
    "predictions": job_predictions,
    "realestate": job_realestate,
}


_INITIAL_SKIP = {
    # job_name: (Model, col, 스킵 임계값)
    # 임계값 내에 최근 데이터가 있으면 초기 실행 생략
    "bonds":       ("BondRate",        "collected_at", timedelta(hours=1)),
    "exchange":    ("ExchangeRate",     "collected_at", timedelta(minutes=30)),
    "commodities": ("Commodity",        "collected_at", timedelta(minutes=30)),
    "news":        ("TechNews",         "collected_at", timedelta(hours=6)),
    "macro":       ("MacroIndicator",   "collected_at", timedelta(minutes=30)),
    "history":     ("BondRate",         "collected_at", timedelta(hours=20)),
}


def _needs_initial_run(job_name: str) -> bool:
    """DB에 최근 데이터가 없을 때만 True 반환."""
    if job_name not in _INITIAL_SKIP:
        return True
    import models
    model_name, col_name, threshold = _INITIAL_SKIP[job_name]
    model = getattr(models, model_name)
    col = getattr(model, col_name)
    db = SessionLocal()
    try:
        latest = db.query(func.max(col)).scalar()
    finally:
        db.close()
    if latest is None:
        return True
    return datetime.utcnow() - latest > threshold


def start_scheduler():
    scheduler.add_job(job_bonds, IntervalTrigger(hours=1), id="bonds", replace_existing=True)
    scheduler.add_job(job_exchange, IntervalTrigger(minutes=30), id="exchange", replace_existing=True)
    scheduler.add_job(job_commodities, IntervalTrigger(minutes=30), id="commodities", replace_existing=True)
    scheduler.add_job(job_news, IntervalTrigger(hours=6), id="news", replace_existing=True)
    scheduler.add_job(job_macro, IntervalTrigger(minutes=30), id="macro", replace_existing=True)
    scheduler.add_job(job_history, IntervalTrigger(hours=24), id="history", replace_existing=True)
    scheduler.add_job(job_predictions, IntervalTrigger(hours=6), id="predictions", replace_existing=True)
    scheduler.add_job(job_realestate, IntervalTrigger(hours=24), id="realestate", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started")

    import threading
    initial_jobs = ["bonds", "exchange", "commodities", "news", "macro", "history"]

    def _initial_runs():
        for name in initial_jobs:
            if not _needs_initial_run(name):
                logger.info("Initial run skipped (recent data exists): %s", name)
                continue
            try:
                logger.info("Initial run started: %s", name)
                JOB_MAP[name]()
            except Exception as e:
                logger.error("Initial run %s failed: %s", name, e)

    threading.Thread(target=_initial_runs, daemon=True).start()


def stop_scheduler():
    scheduler.shutdown()
