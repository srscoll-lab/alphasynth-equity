from controlled_cohort_audit import audit_controlled_cohort


def test_controlled_cohort_is_balanced_and_current_rows_are_valid():
    result = audit_controlled_cohort()

    assert result["companyCount"] == 25
    assert result["lifecycleCounts"] == {
        "WATCH": 5,
        "EMERGING": 5,
        "BUILDING": 5,
        "ESTABLISHED": 5,
        "FADING": 5,
    }
    assert result["structuralErrors"] == []
    assert result["rowErrors"] == []
    assert result["candidateReadyCount"] == 19
    assert result["candidateReadyPct"] == 76.0
    assert result["releaseGatePassed"] is True
    assert result["candidateReadySymbols"] == [
        "ADANIENSOL",
        "ADANIENT",
        "BAJAJ-AUTO",
        "BAJFINANCE",
        "BEL",
        "BHARTIARTL",
        "GRASIM",
        "HCLTECH",
        "HINDZINC",
        "JSWSTEEL",
        "LT",
        "PIDILITIND",
        "RELIANCE",
        "SUNPHARMA",
        "TATASTEEL",
        "TCS",
        "TITAN",
        "TRENT",
        "ULTRACEMCO",
    ]
    assert result["pendingEvidenceCount"] == 6
