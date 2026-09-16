import sqlite3

from stock_intelligence.factor_analysis import load_factor_analyses
from stock_intelligence.publication_eligibility import assess_publication_eligibility


def test_loads_only_sourced_comparable_promoted_evidence(tmp_path):
    database = tmp_path / "bms.db"
    connection = sqlite3.connect(database)
    connection.executescript(
        """
        CREATE TABLE companies (id INTEGER PRIMARY KEY, nse_symbol TEXT, symbol TEXT);
        CREATE TABLE change_records (
          id INTEGER PRIMARY KEY, company_id INTEGER, metric_or_topic TEXT, previous_period TEXT,
          current_period TEXT, previous_value TEXT, current_value TEXT,
          change_value TEXT, confidence REAL
        );
        INSERT INTO companies VALUES (1, 'TESTCO', 'TESTCO');
        """
    )
    rows = [
        (1, 1, "revenue", "Q3 FY25", "Q3 FY26", "100", "120", "20", 0.9),
        (2, 1, "operating_margin", "Q3 FY25", "Q3 FY26", "10", "12", "20", 0.8),
        (3, 1, "order_book", "Q3 FY25", "Q3 FY26", "50", "60", "20", 0.8),
        (4, 1, "net_debt", "Q3 FY25", "Q3 FY26", "40", "30", "-25", 0.9),
    ]
    connection.executemany(
        "INSERT INTO change_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows
    )
    connection.commit()
    connection.close()

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={"TESTCO": "Q3 FY26"},
        scores_by_symbol={
            "TESTCO": {
                "earnings": 1.0,
                "economics": 1.0,
                "execution": 1.0,
                "balance_sheet": 1.0,
                "management_delivery": 0.0,
            }
        },
    )
    eligibility = assess_publication_eligibility(analyses["TESTCO"])

    assert eligibility.score_publishable is True
    assert eligibility.complete_factor_count == 4
    assert eligibility.coverage_weight == 0.90
    management = next(
        factor
        for factor in analyses["TESTCO"]["factors"]
        if factor["id"] == "management_delivery"
    )
    assert management["availability"] == "unavailable"
    assert management["current"]["factor_score"] is None


def test_attaches_cutoff_safe_supplemental_official_evidence(tmp_path):
    database = tmp_path / "bms.db"
    connection = sqlite3.connect(database)
    connection.executescript(
        """
        CREATE TABLE companies (id INTEGER PRIMARY KEY, nse_symbol TEXT, symbol TEXT);
        CREATE TABLE change_records (
          id INTEGER PRIMARY KEY, company_id INTEGER, metric_or_topic TEXT, previous_period TEXT,
          current_period TEXT, previous_value TEXT, current_value TEXT,
          change_value TEXT, confidence REAL
        );
        INSERT INTO companies VALUES (1, 'TESTCO', 'TESTCO');
        INSERT INTO change_records VALUES (1, 1, 'revenue', 'Q3 FY25', 'Q3 FY26', '100', '120', '20', 0.9);
        INSERT INTO change_records VALUES (2, 1, 'operating_margin', 'Q3 FY25', 'Q3 FY26', '10', '12', '2', 0.8);
        """
    )
    connection.commit()
    connection.close()
    evidence = tmp_path / "launch.csv"
    evidence.write_text(
        "symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,source_type,source_ref,source_date,cutoff_date,confidence\n"
        "TESTCO,execution,new_loans_booked,Q3 FY25,Q3 FY26,10,12,company_presentation,https://example.com/official.pdf,2026-02-03,2026-08-25,0.95\n"
        "TESTCO,balance_sheet,gnpa,Q3 FY25,Q3 FY26,1.2,1.0,company_presentation,https://example.com/official.pdf,2026-02-03,2026-08-25,0.95\n",
        encoding="utf-8",
    )

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={"TESTCO": "Q3 FY26"},
        scores_by_symbol={"TESTCO": {
            "earnings": 1.0, "economics": 1.0, "execution": 1.0,
            "balance_sheet": 1.0, "management_delivery": 0.0,
        }},
        supplemental_evidence_file=evidence,
    )
    eligibility = assess_publication_eligibility(analyses["TESTCO"])

    assert eligibility.score_publishable is True
    assert eligibility.complete_factor_count == 4
    factors = {factor["id"]: factor for factor in analyses["TESTCO"]["factors"]}
    assert factors["execution"]["confidence"] == "high"
    assert factors["balance_sheet"]["evidence_refs"] == ["https://example.com/official.pdf"]
