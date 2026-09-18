from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVICE_ROOT = ROOT / "services" / "bms-api"
sys.path.insert(0, str(SERVICE_ROOT / "src"))

from stock_intelligence.factor_analysis import load_factor_analyses  # noqa: E402
from stock_intelligence.publication_eligibility import (  # noqa: E402
    FACTOR_WEIGHTS,
    assess_publication_eligibility,
)


def controlled_domains() -> dict[str, set[str]]:
    payload = json.loads(
        (SERVICE_ROOT / "src" / "stock_intelligence" / "bms_controlled_cohort.json")
        .read_text(encoding="utf-8")
    )
    return {
        str(company["symbol"]).strip().upper(): {
            *(str(domain).strip().lower() for domain in company.get("officialDomains", [])),
            "nseindia.com",
            "bseindia.com",
        }
        for company in payload.get("companies", [])
    }


product_file = SERVICE_ROOT / "nifty500_bms_v1_product_view_final.csv"
with product_file.open(encoding="utf-8-sig", newline="") as handle:
    product = list(csv.DictReader(handle))

periods_by_symbol = {
    str(row["symbol"]).strip().upper(): str(row["period"]).strip()
    for row in product
}
scores_by_symbol = {
    str(row["symbol"]).strip().upper(): {
        factor: float(row[factor]) if str(row.get(factor) or "").strip() else None
        for factor in FACTOR_WEIGHTS
    }
    for row in product
}

analyses = load_factor_analyses(
    SERVICE_ROOT / "nifty500_bms_v1_candidate.db",
    periods_by_symbol=periods_by_symbol,
    scores_by_symbol=scores_by_symbol,
    supplemental_evidence_file=(
        SERVICE_ROOT / "src" / "stock_intelligence" / "bms_launch_factor_evidence.csv"
    ),
    official_domains_by_symbol=controlled_domains(),
    legacy_fundamentals_file=(
        SERVICE_ROOT / "final_validation" / "nifty500_bms_v1_fundamentals.csv"
    ),
    legacy_snapshot_date="2026-08-22",
)

eligibilities = {
    symbol: assess_publication_eligibility(analysis).as_dict()
    for symbol, analysis in analyses.items()
}
eligible = sorted(
    symbol for symbol, result in eligibilities.items() if result["scorePublishable"]
)
near_eligible = sorted(
    (
        {
            "symbol": symbol,
            "completeFactors": result["completeFactorIds"],
            "missingFactors": result["missingFactorIds"],
        }
        for symbol, result in eligibilities.items()
        if not result["scorePublishable"] and result["completeFactorCount"] >= 3
    ),
    key=lambda item: item["symbol"],
)
repair = {
    factor: sum(factor in result["missingFactorIds"] for result in eligibilities.values())
    for factor in FACTOR_WEIGHTS
}
print(json.dumps({
    "publishedCompanies": len(eligible),
    "monitoredCompanies": len(eligibilities),
    "excludedPendingRepair": len(eligibilities) - len(eligible),
    "publishedSymbols": eligible,
    "oneFactorShort": near_eligible,
    "repairQueueMissingFactorCounts": repair,
}, indent=2))
