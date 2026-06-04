import logging
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
from deep_translator import GoogleTranslator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from models import TechNews
from crawlers.theme_classifier import classify_batch

logger = logging.getLogger(__name__)

RSS_FEEDS = {
    "TechCrunch": "https://techcrunch.com/feed/",
    "MIT Technology Review": "https://www.technologyreview.com/feed/",
    "Ars Technica": "https://feeds.arstechnica.com/arstechnica/technology-lab",
    "The Verge": "https://www.theverge.com/rss/index.xml",
    "Wired": "https://www.wired.com/feed/rss",
}

translator = GoogleTranslator(source="auto", target="ko")


def _parse_date(entry) -> datetime | None:
    for attr in ("published", "updated"):
        raw = getattr(entry, attr, None)
        if raw:
            try:
                dt = parsedate_to_datetime(raw)
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                pass
    return None


def _translate(text: str) -> str | None:
    try:
        return translator.translate(text)
    except Exception as e:
        logger.warning("Translation failed: %s", e)
        return None


def _translate_batch(titles: list[str]) -> list[str | None]:
    """최대 5,000자 제한을 고려해 소배치로 번역"""
    results = []
    for title in titles:
        results.append(_translate(title))
        time.sleep(0.1)  # Google Translate 요청 간격
    return results


def crawl_tech_news(db: Session) -> None:
    """RSS 피드에서 기술 트렌드 뉴스 수집 후 한국어 제목 번역"""
    now = datetime.utcnow()
    collected = 0
    skipped = 0

    for source, url in RSS_FEEDS.items():
        try:
            feed = feedparser.parse(url)
            new_records: list[TechNews] = []

            for entry in feed.entries[:20]:
                title = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                if not title or not link:
                    continue

                published_at = _parse_date(entry)
                record = TechNews(
                    title=title,
                    url=link,
                    source=source,
                    published_at=published_at,
                    collected_at=now,
                )
                try:
                    db.add(record)
                    db.flush()
                    new_records.append(record)
                except IntegrityError:
                    db.rollback()
                    skipped += 1

            # 새로 추가된 기사만 번역 + 분류
            if new_records:
                titles = [r.title for r in new_records]
                translations = _translate_batch(titles)
                themes = classify_batch(titles)
                for record, title_ko, theme in zip(new_records, translations, themes):
                    record.title_ko = title_ko
                    record.theme = theme
                collected += len(new_records)

        except Exception as e:
            logger.error("Failed to crawl RSS from %s: %s", source, e)

    db.commit()
    logger.info("Tech news: collected=%d, skipped(duplicate)=%d", collected, skipped)


def translate_pending(db: Session, batch_size: int = 50) -> int:
    """title_ko가 없는 기존 기사를 일괄 번역"""
    rows = (
        db.query(TechNews)
        .filter(TechNews.title_ko.is_(None))
        .limit(batch_size)
        .all()
    )
    if not rows:
        return 0

    for row in rows:
        row.title_ko = _translate(row.title)
        time.sleep(0.1)

    db.commit()
    logger.info("Translated %d pending news items", len(rows))
    return len(rows)
