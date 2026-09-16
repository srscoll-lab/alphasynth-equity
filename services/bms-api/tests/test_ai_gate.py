from stock_intelligence.ai_gate import decide_ai
from stock_intelligence.normalise import normalise_item
from stock_intelligence.schemas import CollectedItem


def test_structured_tip_does_not_need_ai() -> None:
    item = normalise_item(
        CollectedItem(
            source_type="social",
            source_name="Example",
            raw_text="BUY ABC at 100, TARGET 115, STOP LOSS 94." * 8,
        )
    )
    decision = decide_ai(item)
    assert decision.invoke_ai is False


def test_long_form_thesis_needs_ai() -> None:
    item = normalise_item(
        CollectedItem(
            source_type="research",
            source_name="Example",
            raw_text=(
                "The thesis is based on earnings acceleration and improving cash flow. "
                "Management guidance suggests margin expansion, although valuation remains a risk. "
            ) * 4,
        )
    )
    decision = decide_ai(item)
    assert decision.invoke_ai is True
