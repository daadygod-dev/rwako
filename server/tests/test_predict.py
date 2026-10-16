"""Tests for counterfactual prediction (live data + synthetic guards)."""

from __future__ import annotations

import pandas as pd
from fastapi.testclient import TestClient

from server.app import app
from server.services import analytics as A

client = TestClient(app)


def test_predict_live_poverty_nyamagabe():
    body = {"target": "poverty_rate", "adm2_pcode": "RW25",
            "scenario": {"electricity_access": 80.0}}
    r = client.post("/api/v1/analysis/predict", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["district"] == "Nyamagabe"
    assert out["n_rows"] >= 8
    assert out["n_features"] >= 2
    assert abs(out["delta"] - (out["predicted"] - out["baseline"])) < 0.01
    assert isinstance(out["cv_r2"], float) and isinstance(out["cv_mae"], float)
    assert out["top_drivers"] and out["feature_ranges"]
    assert "causal" in out["caveat"]


def test_predict_deterministic():
    body = {"target": "poverty_rate", "adm2_pcode": "RW25",
            "scenario": {"electricity_access": 80.0}}
    a = client.post("/api/v1/analysis/predict", json=body).json()
    b = client.post("/api/v1/analysis/predict", json=body).json()
    assert a["predicted"] == b["predicted"] and a["cv_r2"] == b["cv_r2"]


def test_predict_unknown_district_404():
    r = client.post("/api/v1/analysis/predict",
                    json={"target": "poverty_rate", "adm2_pcode": "XX", "scenario": {}})
    assert r.status_code == 404


def test_predict_target_in_scenario_422():
    r = client.post("/api/v1/analysis/predict",
                    json={"target": "poverty_rate", "adm2_pcode": "RW25",
                          "scenario": {"poverty_rate": 10}})
    assert r.status_code == 422


def test_predict_unknown_target_422():
    r = client.post("/api/v1/analysis/predict",
                    json={"target": "nope", "adm2_pcode": "RW25", "scenario": {}})
    assert r.status_code == 422


def test_predict_clips_extrapolation():
    r = client.post("/api/v1/analysis/predict",
                    json={"target": "poverty_rate", "adm2_pcode": "RW25",
                          "scenario": {"electricity_access": 9999}})
    assert r.status_code == 200
    assert "electricity_access" in r.json()["clipped"]


def test_predict_insufficient_data_raises():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [2.0, 3.0, 4.0], "poverty_rate": [5.0, 6.0, 7.0]},
                      index=["X1", "X2", "X3"])
    try:
        A.predict_scenario(df, "poverty_rate", "X1", {})
        raise AssertionError("should have raised")
    except ValueError as exc:
        assert "complete districts" in str(exc)


def test_predict_unknown_district_value_error():
    import numpy as np

    idx = [f"D{i}" for i in range(10)]
    df = pd.DataFrame(
        {"a": np.arange(10, dtype=float), "b": np.arange(10, dtype=float) * 2,
         "poverty_rate": np.arange(10, dtype=float) + 20},
        index=idx,
    )
    try:
        A.predict_scenario(df, "poverty_rate", "ZZ", {})
        raise AssertionError("should have raised")
    except ValueError as exc:
        assert "lacks complete data" in str(exc)
