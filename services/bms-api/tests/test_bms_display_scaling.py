from stock_intelligence.bms_api import bms_display_change_points, bms_display_score


def test_display_score_matches_alpha_synth_frontend_scale():
    assert bms_display_score(0.12) == 58
    assert bms_display_score(0.0) == 50
    assert bms_display_score(0.75) == 100
    assert bms_display_score(-0.75) == 0


def test_display_change_matches_alpha_synth_frontend_scale():
    assert bms_display_change_points(-0.16) == -11
    assert bms_display_change_points(0.12) == 8
    assert bms_display_change_points(0.0) == 0
