import hashlib
import re

from .schemas import CollectedItem, NormalisedItem


def clean_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def content_hash(source_type: str, title: str | None, text: str) -> str:
    canonical = f"{source_type}|{title or ''}|{text}".lower()
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalise_item(item: CollectedItem) -> NormalisedItem:
    title = clean_text(item.title) if item.title else None
    text = clean_text(item.raw_text)
    return NormalisedItem(
        title=title,
        text=text,
        source_type=item.source_type.strip().lower(),
        source_name=item.source_name.strip(),
        external_id=item.external_id,
        published_at=item.published_at,
        raw_url=item.raw_url,
        content_hash=content_hash(item.source_type, title, text),
    )
