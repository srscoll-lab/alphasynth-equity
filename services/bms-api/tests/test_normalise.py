from stock_intelligence.normalise import normalise_item
from stock_intelligence.schemas import CollectedItem


def test_normalise_collapses_whitespace() -> None:
    result = normalise_item(
        CollectedItem(
            source_type="News",
            source_name="Example",
            raw_text="  Revenue   improved.\nMargins improved.  ",
        )
    )
    assert result.text == "Revenue improved. Margins improved."
    assert len(result.content_hash) == 64
