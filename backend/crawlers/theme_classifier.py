import json
import logging
import os

import anthropic
from sqlalchemy.orm import Session

from models import TechNews

logger = logging.getLogger(__name__)

THEMES = [
    "AI/머신러닝",
    "반도체/하드웨어",
    "소프트웨어/클라우드",
    "스타트업/투자",
    "빅테크/기업",
    "보안/프라이버시",
    "에너지/환경",
    "우주/항공",
    "바이오/헬스케어",
    "기타",
]

SYSTEM_PROMPT = (
    "당신은 기술 뉴스 분류기입니다. 주어진 영어 제목들을 아래 테마 중 하나로 분류하세요.\n\n"
    "테마 목록:\n"
    + "\n".join(f"- {t}" for t in THEMES)
    + "\n\n"
    "응답은 반드시 JSON 배열 형식으로, 입력 순서대로 각 제목의 테마 문자열만 반환하세요.\n"
    '예시: ["AI/머신러닝", "반도체/하드웨어", "기타"]'
)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def classify_batch(titles: list[str]) -> list[str]:
    """Classify up to 20 titles in one API call. Returns theme strings in order."""
    if not titles:
        return []

    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
    client = _get_client()

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": numbered}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        themes = json.loads(raw)
        if isinstance(themes, list) and len(themes) == len(titles):
            # Validate each entry is a known theme
            valid = {t for t in THEMES}
            return [t if t in valid else "기타" for t in themes]
    except Exception as e:
        logger.warning("Theme classification failed: %s", e)

    return ["기타"] * len(titles)


def classify_pending(db: Session, batch_size: int = 60) -> int:
    """Classify articles that have no theme yet, in batches of 15."""
    rows = (
        db.query(TechNews)
        .filter(TechNews.theme.is_(None))
        .limit(batch_size)
        .all()
    )
    if not rows:
        return 0

    chunk = 15
    classified = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i : i + chunk]
        themes = classify_batch([r.title for r in batch])
        for row, theme in zip(batch, themes):
            row.theme = theme
        classified += len(batch)

    db.commit()
    logger.info("Classified %d news articles", classified)
    return classified
