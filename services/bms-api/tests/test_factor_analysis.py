import sqlite3

from stock_intelligence.factor_analysis import load_factor_analyses
from stock_intelligence.publication_eligibility import assess_publication_eligibility


def test_loads_only_sourced_comparable_promoted_evidence(tmp_path):
    database = tmp_path / "bms.db"
    connection = sqlite3.connect(database)
    connection.executescript(
        """
        CREATE TABLE companies (id INTEGER PRIMARY KEY, nse_symbol TEXT, symbol TEXT);
        CREATE TABLE theses (id INTEGER PRIMARY KEY, company_id INTEGER);
        CREATE TABLE change_records (
          id INTEGER PRIMARY KEY, metric_or_topic TEXT, previous_period TEXT,
          current_period TEXT, previous_value TEXT, current_value TEXT,
          change_value TEXT, confidence REAL
        );
        CREATE TABLE thesis_evidence (
          id INTEGER PRIMARY KEY, thesis_id INTEGER, evidence_type TEXT,
          confidence REAL, change_record_id INTEGER
        );
        INSERT INTO companies VALUES (1, 'TESTCO', 'TESTCO');
        INSERT INTO theses VALUES (10, 1);
        """
    )
    rows = [
        (1, "revenue", "Q3 FY25", "Q3 FY26", "100", "120", "20", 0.9),
        (2, "operating_margin", "Q3 FY25", "Q3 FY26", "10", "12", "20", 0.8),
        (3, "order_book", "Q3 FY25", "Q3 FY26", "50", "60", "20", 0.8),
        (4, "net_debt", "Q3 FY25", "Q3 FY26", "40", "30", "-25", 0.9),
    ]
    connection.executemany(
        "INSERT INTO change_records VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows
    )
    connection.executemany(
        "INSERT INTO thesis_evidence VALUES (?, 10, ?, 0.8, ?)",
        [(row[0], row[1], row[0]) for row in rows],
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
