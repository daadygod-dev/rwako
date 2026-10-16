"""Shared fixtures. Synthetic data here is FOR TESTS ONLY — it never reaches
the API responses; the smoke test against real data/processed lives in
smoke_test_real.py."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from server.services import analytics as A


@pytest.fixture()
def synthetic_values() -> pd.DataFrame:
    """6 districts × 4 indicators (3 cov-gated OK, 1 constant-in-one-row NaN case)."""
    rng = np.random.default_rng(7)
    n = 6
    return pd.DataFrame(
        {
            "poverty_rate": np.sort(rng.uniform(15, 55, n))[::-1],          # worse_high
            "adult_literacy_rate": np.sort(rng.uniform(60, 95, n)),         # better_high
            "electricity_access": np.sort(rng.uniform(8, 70, n)),           # better_high
            "health_per_1000km2": np.sort(rng.uniform(12, 900, n))[::-1],   # worse_high
        },
        index=[f"RW{i}" for i in range(1, n + 1)],
    )
