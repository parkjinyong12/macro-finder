from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = (
    "postgresql://neondb_owner:npg_Nm58UFxRzYQj"
    "@ep-bitter-night-a1j4rhgo-pooler.ap-southeast-1.aws.neon.tech"
    "/neondb?sslmode=require&channel_binding=require"
)

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
