import sqlite3

from stock_intelligence import bms_api


def test_provenance_repair_joins_units_without_publishing(monkeypatch, tmp_path):
    database = tmp_path / "repair.db"
    connection = sqlite3.connect(database)
    connection.executescript(
        """
        CREATE TABLE companies (id INTEGER PRIMARY KEY, symbol TEXT, nse_symbol TEXT);
        CREATE TABLE change_records (
          id INTEGER PRIMARY KEY, company_id INTEGER, metric_or_topic TEXT,
          previous_period TEXT, current_period TEXT, previous_value NUMERIC,
          current_value NUMERIC, change_value NUMERIC, confidence NUMERIC
        );
        CREATE TABLE financial_observations (
          id INTEGER PRIMARY KEY, company_id INTEGER, metric_name TEXT,
          metric_value NUMERIC, unit TEXT, period_label TEXT,
          period_end_date TEXT, source_type TEXT, confidence NUMERIC
        );
        INSERT INTO companies VALUES (1, 'TEST', 'TEST');
        INSERT INTO change_records VALUES
          (1, 1, 'revenue', 'Q3 FY25', 'Q3 FY26', 100, 120, 20, 0.9);
        INSERT INTO financial_observations VALUES
          (1, 1, 'revenue', 100, 'Rs.Cr', 'Q3 FY25', '2024-12-31', 'csv_import', 0.9),
          (2, 1, 'revenue', 120, 'Rs.Cr', 'Q3 FY26', '2025-12-31', 'csv_import', 0.9),
          (3, 1, 'order_book', 500, 'Rs.Cr', 'Q3 FY25', '2024-12-31', 'csv_import', 0.8),
          (4, 1, 'order_book', 650, 'Rs.Cr', 'Q3 FY26', '2025-12-31', 'csv_import', 0.8);
        """
    )
    connection.close()
    monkeypatch.setattr(bms_api, "BMS_DB_FILE", database)

    result = bms_api.bms_provenance_repair("test")

    assert result["found"] is True
    assert result["known_official_sources"] == []
    assert result["candidates"][0] == {
        "change_record_id": 1,
        "factor": "earnings",
        "metric_name": "revenue",
        "previous_period": "Q3 FY25",
        "current_period": "Q3 FY26",
        "previous_value": 100,
        "current_value": 120,
        "change_value": 20,
        "unit": "Rs.Cr",
        "previous_period_end_date": "2024-12-31",
        "current_period_end_date": "2025-12-31",
        "legacy_source_type": "csv_import",
        "confidence": 0.9,
    }
    assert result["candidates"][1] == {
        "change_record_id": None,
        "factor": "execution",
        "metric_name": "order_book",
        "previous_period": "Q3 FY25",
        "current_period": "Q3 FY26",
        "previous_value": 500,
        "current_value": 650,
        "change_value": None,
        "unit": "Rs.Cr",
        "previous_period_end_date": "2024-12-31",
        "current_period_end_date": "2025-12-31",
        "legacy_source_type": "csv_import",
        "confidence": 0.8,
    }
