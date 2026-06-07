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
    from models import BondRate, ExchangeRate, Commodity, TechNews, MacroIndicator, Prediction  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_ohlc()


def _migrate_ohlc():
    """기존 macro_indicators 테이블에 OHLC 컬럼 추가 (없을 때만)."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns("macro_indicators")}
    with engine.begin() as conn:
        for col in ("open_price", "high_price", "low_price"):
            if col not in existing:
                conn.execute(text(f"ALTER TABLE macro_indicators ADD COLUMN {col} FLOAT"))
