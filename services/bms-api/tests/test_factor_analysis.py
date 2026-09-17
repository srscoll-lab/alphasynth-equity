import sqlite3
from pathlib import Path

from stock_intelligence.factor_analysis import load_factor_analyses
from stock_intelligence.publication_eligibility import assess_publication_eligibility


def test_internal_change_record_ids_do_not_qualify_as_official_sources(tmp_path):
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

    assert eligibility.score_publishable is False
    assert eligibility.complete_factor_count == 0
    assert eligibility.coverage_weight == 0


def test_legacy_quarterly_result_provenance_is_recovered_from_raw_item(tmp_path):
    database = tmp_path / "bms.db"
    connection = sqlite3.connect(database)
    connection.executescript(
        """
        CREATE TABLE companies (id INTEGER PRIMARY KEY, nse_symbol TEXT, symbol TEXT);
        CREATE TABLE sources (id INTEGER PRIMARY KEY, source_type TEXT);
        CREATE TABLE raw_items (
          id INTEGER PRIMARY KEY, source_id INTEGER, raw_url TEXT, published_at TEXT
        );
        CREATE TABLE change_records (
          id INTEGER PRIMARY KEY, company_id INTEGER, raw_item_id INTEGER,
          metric_or_topic TEXT, previous_period TEXT, current_period TEXT,
          previous_value TEXT, current_value TEXT, change_value TEXT, confidence REAL
        );
        INSERT INTO companies VALUES (1, 'TESTCO', 'TESTCO');
        INSERT INTO sources VALUES (1, 'quarterly_result');
        INSERT INTO raw_items VALUES (
          1, 1, 'https://company.example/q3-results.pdf', '2026-02-01T00:00:00'
        );
        INSERT INTO change_records VALUES (1, 1, 1, 'revenue', 'Q3 FY25', 'Q3 FY26', '100', '120', '20', 0.9);
        INSERT INTO change_records VALUES (2, 1, 1, 'operating_margin', 'Q3 FY25', 'Q3 FY26', '10', '12', '2', 0.9);
        INSERT INTO change_records VALUES (3, 1, 1, 'order_book', 'Q3 FY25', 'Q3 FY26', '50', '60', '10', 0.9);
        INSERT INTO change_records VALUES (4, 1, 1, 'total_debt', 'Q3 FY25', 'Q3 FY26', '40', '30', '-10', 0.9);
        """
    )
    connection.commit()
    connection.close()

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={"TESTCO": "Q3 FY26"},
        scores_by_symbol={"TESTCO": {
            "earnings": 1.0, "economics": 1.0,
            "execution": 1.0, "balance_sheet": 1.0,
        }},
    )
    eligibility = assess_publication_eligibility(analyses["TESTCO"])

    assert eligibility.score_publishable is True
    assert eligibility.complete_factor_count == 4
    assert analyses["TESTCO"]["comparison_basis"] == "same-quarter-prior-year"


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
        "symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,unit,source_type,source_ref,source_date,cutoff_date,confidence\n"
        "TESTCO,execution,new_loans_booked,Q3 FY25,Q3 FY26,10,12,million,company_presentation,https://example.com/official.pdf,2026-02-03,2026-08-25,0.95\n"
        "TESTCO,balance_sheet,gnpa,Q3 FY25,Q3 FY26,1.2,1.0,%,company_presentation,https://example.com/official.pdf,2026-02-03,2026-08-25,0.95\n",
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

    assert eligibility.score_publishable is False
    assert eligibility.complete_factor_count == 2
    factors = {factor["id"]: factor for factor in analyses["TESTCO"]["factors"]}
    assert factors["execution"]["confidence"] == "high"
    assert factors["execution"]["current"]["metrics"][0]["unit"] == "million"
    assert factors["balance_sheet"]["evidence_refs"] == ["https://example.com/official.pdf"]


def test_preserves_cumulative_period_label_for_matching_reporting_quarter(tmp_path):
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
    connection.commit()
    connection.close()
    evidence = tmp_path / "launch.csv"
    evidence.write_text(
        "symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,unit,source_type,source_ref,source_date,cutoff_date,confidence\n"
        "TESTCO,execution,order_book,9M FY25,9M FY26,10,12,Rs.Cr,company_results,https://example.com/results.pdf,2026-02-03,2026-08-25,0.95\n",
        encoding="utf-8",
    )

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={"TESTCO": "Q3 FY26"},
        scores_by_symbol={"TESTCO": {"execution": 1.0}},
        supplemental_evidence_file=evidence,
    )
    execution = next(
        factor for factor in analyses["TESTCO"]["factors"] if factor["id"] == "execution"
    )

    assert execution["availability"] == "complete"
    assert execution["previous"]["period"] == "9M FY25"
    assert execution["current"]["period"] == "9M FY26"


def test_rejects_supplemental_evidence_from_unapproved_domain(tmp_path):
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
    connection.commit()
    connection.close()
    evidence = tmp_path / "launch.csv"
    evidence.write_text(
        "symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,unit,source_type,source_ref,source_date,cutoff_date,confidence\n"
        "TESTCO,execution,order_book,Q3 FY25,Q3 FY26,10,12,Rs.Cr,company_results,https://aggregator.example/results.pdf,2026-02-03,2026-08-25,0.95\n",
        encoding="utf-8",
    )

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={"TESTCO": "Q3 FY26"},
        scores_by_symbol={"TESTCO": {"execution": 1.0}},
        supplemental_evidence_file=evidence,
        official_domains_by_symbol={"TESTCO": {"company.example"}},
    )
    execution = next(
        factor for factor in analyses["TESTCO"]["factors"] if factor["id"] == "execution"
    )
    assert execution["availability"] == "unavailable"


def test_preserves_separate_official_sources_for_previous_and_current_values(tmp_path):
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
    connection.commit()
    connection.close()
    evidence = tmp_path / "launch.csv"
    evidence.write_text(
        "symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,unit,source_type,source_ref,previous_source_ref,current_source_ref,source_date,cutoff_date,confidence\n"
        "TESTCO,execution,order_book,Q3 FY25,Q3 FY26,10,12,Rs.Cr,company_results,https://company.example/current.pdf,https://company.example/prior.pdf,https://company.example/current.pdf,2026-02-03,2026-08-25,0.95\n",
        encoding="utf-8",
    )

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={"TESTCO": "Q3 FY26"},
        scores_by_symbol={"TESTCO": {"execution": 1.0}},
        supplemental_evidence_file=evidence,
        official_domains_by_symbol={"TESTCO": {"company.example"}},
    )
    execution = next(
        factor for factor in analyses["TESTCO"]["factors"] if factor["id"] == "execution"
    )

    assert execution["availability"] == "complete"
    assert execution["evidence_refs"] == [
        "https://company.example/prior.pdf",
        "https://company.example/current.pdf",
    ]


def test_launch_cohort_supplemental_rows_are_admitted(tmp_path):
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
        """
    )
    symbols = ["LT", "ADANIENSOL", "TATASTEEL", "ULTRACEMCO"]
    for company_id, symbol in enumerate(symbols, start=1):
        connection.execute("INSERT INTO companies VALUES (?, ?, ?)", (company_id, symbol, symbol))
        connection.execute(
            "INSERT INTO change_records VALUES (?, ?, 'revenue', 'Q3 FY25', 'Q3 FY26', '100', '120', '20', 0.9)",
            (company_id * 10 + 1, company_id),
        )
        connection.execute(
            "INSERT INTO change_records VALUES (?, ?, 'operating_margin', 'Q3 FY25', 'Q3 FY26', '10', '12', '2', 0.9)",
            (company_id * 10 + 2, company_id),
        )
    connection.commit()
    connection.close()

    analyses = load_factor_analyses(
        database,
        periods_by_symbol={symbol: "Q3 FY26" for symbol in symbols},
        scores_by_symbol={symbol: {
            "earnings": 1.0, "economics": 1.0, "execution": 1.0,
            "balance_sheet": 1.0, "management_delivery": 1.0,
        } for symbol in symbols},
        supplemental_evidence_file=(
            Path(__file__).parents[1]
            / "src" / "stock_intelligence" / "bms_launch_factor_evidence.csv"
        ),
    )

    for symbol in {"LT", "TATASTEEL", "ULTRACEMCO"}:
        eligibility = assess_publication_eligibility(analyses[symbol])
        assert eligibility.score_publishable is False
        assert set(eligibility.complete_factor_ids) == {"execution", "balance_sheet"}

    adani_eligibility = assess_publication_eligibility(analyses["ADANIENSOL"])
    assert adani_eligibility.score_publishable is False
    assert set(adani_eligibility.complete_factor_ids) == {"execution"}
    assert set(adani_eligibility.missing_factor_ids) == {
        "earnings", "economics", "balance_sheet"
    }
