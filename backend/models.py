from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from database import Base


class BondRate(Base):
    __tablename__ = "bond_rates"

    id = Column(Integer, primary_key=True, index=True)
    tenor = Column(String(10), nullable=False)  # '3Y','5Y','10Y','20Y','30Y'
    rate = Column(Float, nullable=False)
    collected_at = Column(DateTime, default=datetime.utcnow, index=True)


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, index=True)
    currency = Column(String(10), nullable=False)  # 'USDKRW','EURKRW','JPYKRW'
    rate = Column(Float, nullable=False)
    collected_at = Column(DateTime, default=datetime.utcnow, index=True)


class Commodity(Base):
    __tablename__ = "commodities"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False)   # 'GC=F','CL=F','HG=F'
    name = Column(String(50), nullable=False)     # '금','원유','구리'
    price = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    collected_at = Column(DateTime, default=datetime.utcnow, index=True)


class MacroIndicator(Base):
    __tablename__ = "macro_indicators"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)  # KOSPI, VIX, DXY, US10Y, FEDRATE, KRRATE
    name = Column(String(100), nullable=False)
    value = Column(Float, nullable=False)
    collected_at = Column(DateTime, default=datetime.utcnow, index=True)


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    target_symbol = Column(String(50), nullable=False, index=True)
    target_name = Column(String(100), nullable=False)
    direction = Column(String(10), nullable=False)  # '상승', '하락', '보합'
    explanation = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class TechNews(Base):
    __tablename__ = "tech_news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    title_ko = Column(String(600), nullable=True)
    url = Column(String(1000), nullable=False, unique=True)
    source = Column(String(100), nullable=False)
    published_at = Column(DateTime, nullable=True)
    collected_at = Column(DateTime, default=datetime.utcnow, index=True)
    theme = Column(String(100), nullable=True, index=True)
