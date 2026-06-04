"""
Claude API를 활용한 매크로 지표 방향 예측.
최신 지표 데이터를 수집해 각 대상 지표에 대해 상승/하락/보합 방향과 근거를 생성.
"""
import json
import logging
import os
from datetime import datetime, timedelta

import anthropic
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import BondRate, Commodity, ExchangeRate, MacroIndicator, Prediction

logger = logging.getLogger(__name__)

# 예측 대상 지표
PREDICTION_TARGETS = [
    {"symbol": "USDKRW",  "name": "USD/KRW 환율",     "table": "exchange"},
    {"symbol": "KOSPI",   "name": "코스피",             "table": "macro"},
    {"symbol": "GC=F",    "name": "금 가격 (USD/oz)",  "table": "commodity"},
    {"symbol": "CL=F",    "name": "WTI 원유 (USD/bbl)", "table": "commodity"},
    {"symbol": "국고채3Y", "name": "한국 국고채 3Y",    "table": "bond"},
    {"symbol": "US10Y",   "name": "미 10년 국채 수익률", "table": "macro"},
]

SYSTEM_PROMPT = """당신은 글로벌 매크로 경제 전문 애널리스트입니다.
제공된 최신 매크로 경제 지표 데이터를 분석하여, 각 대상 지표의 단기(1~4주) 방향성을 예측합니다.

출력 형식: 반드시 아래 JSON 배열만 반환하세요. 다른 텍스트는 절대 포함하지 마세요.
[
  {
    "symbol": "지표심볼",
    "direction": "상승" | "하락" | "보합",
    "explanation": "한국어로 2~3문장. 어떤 지표가 어떻게 움직였으므로 이 지표에 어떤 압력이 생긴다는 식으로 설명."
  }
]

설명 예시: "달러 인덱스가 하락하고 있어 금 가격에 상승 압력이 높아졌습니다. 미국 기준금리 인하 기대감이 지속되며 안전자산 수요가 확대될 전망입니다."
"""


def _get_recent_trend(values: list[float], window: int = 5) -> str:
    """최근 window개 값으로 추세 판단."""
    if len(values) < 2:
        return "데이터 부족"
    recent = values[-window:]
    if recent[-1] > recent[0] * 1.003:
        return "상승"
    elif recent[-1] < recent[0] * 0.997:
        return "하락"
    return "보합"


def _gather_indicators(db: Session) -> dict:
    """모든 최신 매크로 지표 수집."""
    since = datetime.utcnow() - timedelta(days=30)
    since_long = datetime.utcnow() - timedelta(days=365)  # 기준금리는 연간 기준
    indicators = {}

    # 환율
    for currency in ["USDKRW", "EURKRW", "JPYKRW"]:
        rows = (db.query(ExchangeRate.rate, ExchangeRate.collected_at)
                .filter(ExchangeRate.currency == currency,
                        ExchangeRate.collected_at >= since)
                .order_by(ExchangeRate.collected_at.asc()).all())
        if rows:
            values = [r.rate for r in rows]
            indicators[currency] = {
                "name": f"{currency[:3]}/KRW",
                "latest": values[-1],
                "trend": _get_recent_trend(values),
                "change_pct": round((values[-1] - values[0]) / values[0] * 100, 2) if values[0] else 0,
            }

    # 국채 금리
    for tenor in ["CD91일", "콜금리", "국고채3Y", "회사채3Y"]:
        rows = (db.query(BondRate.rate, BondRate.collected_at)
                .filter(BondRate.tenor == tenor,
                        BondRate.collected_at >= since)
                .order_by(BondRate.collected_at.asc()).all())
        if rows:
            values = [r.rate for r in rows]
            indicators[tenor] = {
                "name": tenor,
                "latest": values[-1],
                "trend": _get_recent_trend(values),
                "change_pct": round(values[-1] - values[0], 3),
            }

    # 상품
    for symbol, name in [("GC=F", "금"), ("CL=F", "WTI원유"),
                          ("HG=F", "구리"), ("SI=F", "은"), ("NG=F", "천연가스")]:
        rows = (db.query(Commodity.price, Commodity.collected_at)
                .filter(Commodity.symbol == symbol,
                        Commodity.collected_at >= since)
                .order_by(Commodity.collected_at.asc()).all())
        if rows:
            values = [r.price for r in rows]
            indicators[symbol] = {
                "name": name,
                "latest": values[-1],
                "trend": _get_recent_trend(values),
                "change_pct": round((values[-1] - values[0]) / values[0] * 100, 2) if values[0] else 0,
            }

    # 추가 매크로 지표 (기준금리는 더 긴 기간으로 조회)
    for symbol in ["KOSPI", "VIX", "DXY", "US10Y", "US5Y", "US2Y",
                   "SPX", "NASDAQ", "USDJPY", "FEDRATE", "KRRATE"]:
        lookback = since_long if symbol in ("FEDRATE", "KRRATE") else since
        rows = (db.query(MacroIndicator.value, MacroIndicator.collected_at, MacroIndicator.name)
                .filter(MacroIndicator.symbol == symbol,
                        MacroIndicator.collected_at >= lookback)
                .order_by(MacroIndicator.collected_at.asc()).all())
        if rows:
            values = [r.value for r in rows]
            indicators[symbol] = {
                "name": rows[0].name,
                "latest": values[-1],
                "trend": _get_recent_trend(values),
                "change_pct": round((values[-1] - values[0]) / values[0] * 100, 2) if values[0] else 0,
            }

    return indicators


def _build_prompt(indicators: dict) -> str:
    lines = ["## 현재 매크로 지표 현황 (최근 30일 기준)\n"]
    for symbol, info in indicators.items():
        trend_sign = "↑" if info["trend"] == "상승" else ("↓" if info["trend"] == "하락" else "→")
        lines.append(
            f"- {info['name']} ({symbol}): {info['latest']:.3f} "
            f"[{trend_sign} {info['trend']}, 변화: {info['change_pct']:+.2f}]"
        )

    lines.append("\n## 예측 대상 지표\n")
    for t in PREDICTION_TARGETS:
        if t["symbol"] in indicators:
            lines.append(f"- {t['name']} ({t['symbol']})")

    lines.append("\n위 데이터를 바탕으로 각 예측 대상 지표의 단기 방향성을 분석해주세요.")
    return "\n".join(lines)


def run_prediction(db: Session) -> list[dict]:
    """Claude API로 예측 생성 후 DB 저장."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")

    indicators = _gather_indicators(db)
    if not indicators:
        logger.warning("No indicator data available for prediction")
        return []

    # 예측 가능한 대상만 필터
    targets_available = [t for t in PREDICTION_TARGETS if t["symbol"] in indicators]
    if not targets_available:
        return []

    prompt = _build_prompt(indicators)
    logger.info("Running prediction with %d indicators, %d targets",
                len(indicators), len(targets_available))

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=2048,
        system=[{
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        predictions = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse prediction JSON: %s\nRaw: %s", e, raw[:500])
        return []

    # DB 저장
    now = datetime.utcnow()
    results = []
    for p in predictions:
        symbol = p.get("symbol", "")
        direction = p.get("direction", "보합")
        explanation = p.get("explanation", "")
        target_info = next((t for t in PREDICTION_TARGETS if t["symbol"] == symbol), None)
        if not target_info:
            continue
        db.add(Prediction(
            target_symbol=symbol,
            target_name=target_info["name"],
            direction=direction,
            explanation=explanation,
            created_at=now,
        ))
        results.append(p)

    db.commit()
    logger.info("Predictions saved: %d", len(results))
    return results
