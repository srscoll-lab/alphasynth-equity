from stock_intelligence.tcs_evidence_mapping import (
    map_evidence_to_tcs_factor,
)


def test_maps_earnings():
    result = map_evidence_to_tcs_factor(evidence_type="Revenue")

    assert result is not None
    assert result.factor_name == "earnings"


def test_maps_economics():
    result = map_evidence_to_tcs_factor(evidence_type="EBITDA Margin")

    assert result is not None
    assert result.factor_name == "economics"


def test_maps_balance_sheet():
    result = map_evidence_to_tcs_factor(evidence_type="GNPA")

    assert result is not None
    assert result.factor_name == "balance_sheet"


def test_maps_management_delivery():
    result = map_evidence_to_tcs_factor(evidence_type="guidance_change")

    assert result is not None
    assert result.factor_name == "management_delivery"


def test_maps_sector_specific_execution_metric():
    result = map_evidence_to_tcs_factor(evidence_type="production_volume_vs_guidance")
    assert result.factor_name == "execution"


def test_maps_launch_cohort_execution_synonyms():
    for metric in [
        "order_inflow", "total_sales_volume", "new_loans_booked",
        "assets_under_management", "customer_franchise",
        "transmission_availability", "distribution_reliability",
    ]:
        result = map_evidence_to_tcs_factor(evidence_type=metric)
        assert result is not None
        assert result.factor_name == "execution"


def test_maps_launch_cohort_balance_sheet_synonyms():
    for metric in [
        "net_debt_to_equity_ratio", "net_cash_from_operating_activities",
        "provision_coverage", "gross_debt",
    ]:
        result = map_evidence_to_tcs_factor(evidence_type=metric)
        assert result is not None
        assert result.factor_name == "balance_sheet"


def test_maps_sector_specific_balance_sheet_metric():
    result = map_evidence_to_tcs_factor(evidence_type="net_debt_to_ebitda_change")
    assert result.factor_name == "balance_sheet"


def test_maps_sector_specific_management_metric_before_execution_suffix():
    result = map_evidence_to_tcs_factor(evidence_type="capex_commitment_delivery")
    assert result.factor_name == "management_delivery"


def test_unknown_evidence_returns_none():
    result = map_evidence_to_tcs_factor(evidence_type="unknown_topic")

    assert result is None
