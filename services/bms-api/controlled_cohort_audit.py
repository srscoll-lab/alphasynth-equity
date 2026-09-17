"""Audit the bounded 25-company BMS evidence expansion before deployment."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from stock_intelligence.factor_analysis import _period_matches_reporting_quarter
from stock_intelligence.tcs_evidence_mapping import map_evidence_to_tcs_factor

BASE = Path(__file__).resolve().parent
COHORT_FILE = BASE / "src" / "stock_intelligence" / "bms_controlled_cohort.json"
EVIDENCE_FILE = BASE / "src" / "stock_intelligence" / "bms_launch_factor_evidence.csv"
TRUSTED_SOURCE_TYPES = {
    "company_filing",
    "company_results",
    "company_presentation",
    "company_transcript",
    "nse_filing",
    "bse_filing",
    "audited_financial_statement",
}


def audit_controlled_cohort(
    cohort_file: Path = COHORT_FILE,
    evidence_file: Path = EVIDENCE_FILE,
) -> dict:
    cohort = json.loads(cohort_file.read_text(encoding="utf-8"))
    companies = cohort.get("companies", [])
    symbols = [str(company.get("symbol") or "").strip().upper() for company in companies]
    lifecycle_counts = Counter(
        str(company.get("lifecycle") or "").strip().upper() for company in companies
    )
    structural_errors: list[str] = []
    if len(symbols) != 25 or len(set(symbols)) != 25:
        structural_errors.append("The controlled cohort must contain 25 unique symbols.")
    expected_lifecycles = {stage: 5 for stage in ["WATCH", "EMERGING", "BUILDING", "ESTABLISHED", "FADING"]}
    if dict(lifecycle_counts) != expected_lifecycles:
        structural_errors.append("The controlled cohort must contain five companies in each lifecycle.")

    domains = {
        str(company["symbol"]).strip().upper(): {
            *(str(domain).strip().lower() for domain in company.get("officialDomains", [])),
            "nseindia.com",
            "bseindia.com",
        }
        for company in companies
    }
    factors_by_symbol: dict[str, set[str]] = defaultdict(set)
    row_errors: list[dict] = []
    seen: set[tuple[str, str, str, str, str]] = set()
    row_count = 0

    with evidence_file.open(encoding="utf-8", newline="") as handle:
        for line_number, row in enumerate(csv.DictReader(handle), start=2):
            row_count += 1
            symbol = str(row.get("symbol") or "").strip().upper()
            factor = str(row.get("factor") or "").strip().lower()
            metric = str(row.get("metric_name") or "").strip().lower()
            current_period = str(row.get("current_period") or "").strip()
            source_type = str(row.get("source_type") or "").strip().lower()
            source_ref = str(row.get("source_ref") or "").strip()
            source_host = (urlparse(source_ref).hostname or "").lower()
            errors: list[str] = []
            mapping = map_evidence_to_tcs_factor(evidence_type=metric)
            if symbol not in domains:
                errors.append("symbol_not_in_controlled_cohort")
            if mapping is None or mapping.factor_name != factor:
                errors.append("factor_mapping_mismatch")
            if not _period_matches_reporting_quarter("Q3 FY26", current_period):
                errors.append("reporting_period_mismatch")
            if not str(row.get("unit") or "").strip():
                errors.append("missing_unit")
            if source_type not in TRUSTED_SOURCE_TYPES:
                errors.append("untrusted_source_type")
            approved = domains.get(symbol, set())
            if not any(source_host == domain or source_host.endswith(f".{domain}") for domain in approved):
                errors.append("unapproved_source_domain")
            try:
                source_date = date.fromisoformat(str(row.get("source_date") or ""))
                cutoff_date = date.fromisoformat(str(row.get("cutoff_date") or ""))
                float(str(row.get("previous_value") or ""))
                float(str(row.get("current_value") or ""))
                confidence = float(str(row.get("confidence") or ""))
                if source_date > cutoff_date:
                    errors.append("post_cutoff_evidence")
                if cutoff_date.isoformat() != str(cohort.get("freezeDate") or ""):
                    errors.append("wrong_freeze_date")
                if not 0 <= confidence <= 1:
                    errors.append("invalid_confidence")
            except ValueError:
                errors.append("invalid_date_or_numeric_value")
            key = (symbol, factor, metric, str(row.get("previous_period")), current_period)
            if key in seen:
                errors.append("duplicate_comparison")
            seen.add(key)
            if errors:
                row_errors.append({"line": line_number, "symbol": symbol, "errors": errors})
            else:
                factors_by_symbol[symbol].add(factor)

    candidate_ready = sorted(
        symbol for symbol in symbols if len(factors_by_symbol.get(symbol, set())) >= 2
    )
    pending = sorted(set(symbols) - set(candidate_ready))
    return {
        "cohortId": cohort.get("cohortId"),
        "freezeDate": cohort.get("freezeDate"),
        "companyCount": len(symbols),
        "lifecycleCounts": dict(lifecycle_counts),
        "evidenceRows": row_count,
        "structuralErrors": structural_errors,
        "rowErrors": row_errors,
        "candidateReadyCount": len(candidate_ready),
        "candidateReadySymbols": candidate_ready,
        "pendingEvidenceCount": len(pending),
        "pendingEvidenceSymbols": pending,
        "supplementalFactors": {
            symbol: sorted(factors_by_symbol.get(symbol, set())) for symbol in symbols
        },
        "note": (
            "Candidate-ready means two supplemental factors passed this file audit. "
            "Final publication still requires the BMS engine's four-factor eligibility check."
        ),
    }


if __name__ == "__main__":
    print(json.dumps(audit_controlled_cohort(), indent=2))
