import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import BondRate, ExchangeRate, Commodity, TechNews, MacroIndicator, Prediction, RealEstateStat  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_ohlc()
    _migrate_realestate()


def _migrate_realestate():
    """real_estate_stats 테이블에 신규 컬럼·제약 추가 (없을 때만)."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    if "real_estate_stats" not in insp.get_table_names():
        return
    existing_cols = {c["name"] for c in insp.get_columns("real_estate_stats")}
    with engine.begin() as conn:
        for col, typ in [
            ("direct_deal_ratio", "FLOAT"),
            ("corp_buyer_ratio", "FLOAT"),
            ("cancelled_count", "INTEGER"),
        ]:
            if col not in existing_cols:
                conn.execute(text(f"ALTER TABLE real_estate_stats ADD COLUMN {col} {typ}"))
        # 유니크 제약 추가 (이미 있으면 무시)
        existing_idx = {i["name"] for i in insp.get_indexes("real_estate_stats")}
        if "uq_realestate_region_ym" not in existing_idx:
            try:
                conn.execute(text(
                    "ALTER TABLE real_estate_stats "
                    "ADD CONSTRAINT uq_realestate_region_ym "
                    "UNIQUE (region_code, deal_ym)"
                ))
            except Exception:
                pass  # 이미 존재하거나 중복 데이터 있으면 스킵


def _migrate_ohlc():
    """기존 macro_indicators 테이블에 OHLC 컬럼 추가 (없을 때만)."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns("macro_indicators")}
    with engine.begin() as conn:
        for col in ("open_price", "high_price", "low_price"):
            if col not in existing:
                conn.execute(text(f"ALTER TABLE macro_indicators ADD COLUMN {col} FLOAT"))
