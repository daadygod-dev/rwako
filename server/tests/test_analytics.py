"""Unit tests for analytics and API contract (synthetic fixtures only)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from server.catalog import INDICATORS
from server.services import analytics as A

DIRECTION = {c: m.direction for c, m in INDICATORS.items()}


# ------------------------------------------------------------------ gaps

def test_gap_matrix_directionality(synthetic_values):
    gaps = A.gap_matrix(synthetic_values, DIRECTION)
    assert gaps["adult_literacy_rate"].iloc[0] == pytest.approx(1.0)     # worst literacy -> gap 1
    assert gaps["adult_literacy_rate"].iloc[-1] == pytest.approx(0.0)    # best literacy -> gap 0
    assert gaps["poverty_rate"].iloc[0] == pytest.approx(1.0)            # worst poverty -> gap 1
    assert gaps["poverty_rate"].iloc[-1] == pytest.approx(0.0)
    finite = gaps.dropna()
    assert ((finite >= 0) & (finite <= 1)).all().all()


def test_gap_matrix_preserves_nan():
    vals = pd.DataFrame({"poverty_rate": [10.0, np.nan, 30.0]}, index=["A", "B", "C"])
    gaps = A.gap_matrix(vals, DIRECTION)
    assert np.isnan(gaps.loc["B", "poverty_rate"])
    assert gaps.loc["A", "poverty_rate"] == pytest.approx(0.0)
    assert gaps.loc["C", "poverty_rate"] == pytest.approx(1.0)


# ------------------------------------------------------------------ index

def test_priority_index_renormalizes_over_covered(synthetic_values):
    gaps = A.gap_matrix(synthetic_values, DIRECTION)
    idx = A.priority_index(gaps, {"poverty_rate": 3, "adult_literacy_rate": 1})
    w_gap = (3 * gaps["poverty_rate"] + 1 * gaps["adult_literacy_rate"]) / 4
    assert idx.to_numpy() == pytest.approx(w_gap.to_numpy())


def test_priority_index_excludes_all_nan_rows():
    gaps = pd.DataFrame({"poverty_rate": [0.2, np.nan]}, index=["A", "B"])
    idx = A.priority_index(gaps, {"poverty_rate": 1})
    assert idx["A"] == pytest.approx(0.2)
    assert np.isnan(idx["B"])


def test_zero_weights_yield_nan():
    gaps = pd.DataFrame({"poverty_rate": [0.2, 0.8]}, index=["A", "B"])
    assert A.priority_index(gaps, {"poverty_rate": 0}).isna().all()


# ------------------------------------------------------------------ allocation

def test_allocation_sums_to_budget_and_respects_floor():
    idx = pd.Series([0.9, 0.5, 0.1, 0.0], index=["A", "B", "C", "D"])
    out = A.allocate(idx, budget_rwf_m=100.0, floor_pct=10)
    assert out["allocation_rwf_m"].sum() == pytest.approx(100.0, abs=1e-3)
    equal = 100.0 / 4
    assert (out["allocation_rwf_m"] >= 0.1 * equal - 1e-3).all()


def test_allocation_no_floor_concentrates():
    idx = pd.Series([1.0, 0.0], index=["A", "B"])
    out = A.allocate(idx, 50.0, 0)
    assert out.iloc[0]["allocation_rwf_m"] == pytest.approx(50.0)


# ------------------------------------------------------------------ typologies / drivers

def test_typologies_deterministic_and_severity_ordered(synthetic_values):
    gaps = A.gap_matrix(synthetic_values, DIRECTION)
    m1, p1, s1 = A.typologies(gaps, 2)
    m2, p2, s2 = A.typologies(gaps, 2)
    assert (m1["cluster"].to_numpy() == m2["cluster"].to_numpy()).all()
    assert s1 == pytest.approx(s2)
    assert p1["severity"].is_monotonic_decreasing
    assert set(m1["cluster"]) <= {1, 2}
    assert -1 <= s1 <= 1


def test_driver_analysis_excludes_target(synthetic_values):
    gaps = A.gap_matrix(synthetic_values, DIRECTION)
    imp, r2 = A.driver_analysis(gaps, "poverty_rate")
    assert "poverty_rate" not in imp.index
    assert imp.sum() == pytest.approx(1.0, abs=1e-6)
    assert np.isfinite(r2)


def test_nearest_neighbours(synthetic_values):
    gaps = A.gap_matrix(synthetic_values, DIRECTION)
    nb = A.nearest_neighbours(gaps.iloc[0], gaps)
    assert 0 < len(nb) <= 4
    assert nb[0] != gaps.index[0]


# ------------------------------------------------------------------ API contract

@pytest.fixture()
def client(monkeypatch, synthetic_values):
    """API served from a synthetic in-memory DataStore (reset between tests)."""
    from server import app as app_module

    values = synthetic_values
    n = len(values)
    district_rows = pd.DataFrame({
        "district": [f"District {i}" for i in range(1, n + 1)],
        "adm2_pcode": list(values.index),
        "province": ["Test Province"] * n,
        "area_km2": [100.0 + i for i in range(n)],
        "health_facilities": list(range(10, 10 + n)),
        "education_facilities": list(range(1, 1 + n)),
    })
    # synthetic values become the "combined" survey columns
    combined = district_rows.copy()
    for col in values.columns:
        combined[col] = values.to_numpy()[:, list(values.columns).index(col)]

    store = app_module.STORE
    monkeypatch.setattr(store, "districts", lambda: district_rows.copy())
    monkeypatch.setattr(store, "combined", lambda: (combined.copy(), []))
    return TestClient(app_module.app)


def test_api_health_and_indicators(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    body = client.get("/api/v1/indicators").json()
    assert len(body) == len(INDICATORS)
    avail = {i["code"]: i["availability"]["available"] for i in body}
    assert avail["poverty_rate"] and avail["health_per_1000km2"]
    assert not avail["stunting_rate"]  # survey indicators absent in tests
    reason = next(i["availability"]["reason"] for i in body if i["code"] == "stunting_rate")
    assert reason  # an explicit reason, never a silent empty state


def test_api_index_deterministic(client):
    payload = {"weights": {"poverty_rate": 3}}
    r1 = client.post("/api/v1/analysis/index", json=payload)
    r2 = client.post("/api/v1/analysis/index", json=payload)
    assert r1.status_code == 200 and r1.json() == r2.json()
    body = r1.json()
    available = sum(1 for c in ("poverty_rate", "adult_literacy_rate", "electricity_access",
                                "health_per_1000km2"))
    assert len(body["indicators_used"]) == available  # defaults fill the rest
    assert body["ranking"][0]["rank"] == 1


def test_api_typologies_contract(client):
    r = client.post("/api/v1/analysis/typologies", json={"k": 3})
    assert r.status_code == 200
    body = r.json()
    assert -1 <= body["silhouette"] <= 1
    assert {m["cluster"] for m in body["members"]} == {1, 2, 3}
    assert len(body["members"]) == 6  # fixture district count
    assert list(body["profiles"][0].keys()) == ["cluster", "severity", "mean_gaps"]
    severities = [p["severity"] for p in body["profiles"]]
    assert severities == sorted(severities, reverse=True)  # cluster 1 = most deprived


def test_api_validation_errors(client):
    assert client.post("/api/v1/analysis/index",
                       json={"weights": {"nope": 1}}).status_code == 422
    assert client.post("/api/v1/analysis/typologies", json={"k": 9}).status_code == 422
    assert client.post("/api/v1/analysis/allocate",
                       json={"budget_rwf_m": 0}).status_code == 422
    assert client.post("/api/v1/analysis/drivers",
                       json={"target": "stunting_rate"}).status_code == 406  # not available in tests


def test_api_allocate_sums_to_budget(client):
    r = client.post("/api/v1/analysis/allocate",
                    json={"budget_rwf_m": 999.999, "floor_pct": 10})
    assert r.status_code == 200
    total = sum(row["allocation_rwf_m"] for row in r.json()["rows"])
    assert total == pytest.approx(999.999, abs=1e-3)


# ------------------------------------------------------------------ population weighting

def test_allocate_population_default_off_keeps_need_shares():
    """Without population data, results must be identical to pure need shares."""
    idx = pd.Series([0.8, 0.4], index=["A", "B"])
    out = A.allocate(idx, 100.0, 0)
    assert out.loc[out["adm2_pcode"] == "A", "allocation_rwf_m"].item() == pytest.approx(66.667, abs=0.01)


def test_allocate_population_scales_shares_not_index():
    """With population, people-weighted shares — displayed index unchanged."""
    idx = pd.Series([0.5, 0.5], index=["A", "B"])
    pop = pd.Series([900_000, 300_000], index=["A", "B"])
    out = A.allocate(idx, 100.0, 0, population=pop)
    a = out.loc[out["adm2_pcode"] == "A", "allocation_rwf_m"].item()
    b = out.loc[out["adm2_pcode"] == "B", "allocation_rwf_m"].item()
    assert a == pytest.approx(75.0, abs=0.05)
    assert b == pytest.approx(25.0, abs=0.05)
    # displayed priority index is the raw need index — never re-scaled
    assert out.loc[out["adm2_pcode"] == "A", "priority_index"].item() == pytest.approx(0.5)
