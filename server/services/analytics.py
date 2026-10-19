"""Analytics & ML services — stateless, deterministic, fit-per-request.

Rules honored here (see docs/SYSTEM_DESIGN.md §5):
- gaps keep NaN for missing values; weighted aggregations renormalize over
  available (non-NaN) indicators per district — no fabricated imputation;
- clustering trains on median-imputed, standardized gaps (only after the
  >=90% coverage gate has already excluded partial indicators);
- drivers always exclude the target column from the feature set (no leakage);
- all randomness pinned via random_state=42.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score, silhouette_score
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.preprocessing import StandardScaler

RANDOM_STATE = 42
MIN_PREDICT_ROWS = 8


# ------------------------------------------------------------------ gaps & index

def gap_matrix(values: pd.DataFrame, direction: dict[str, str]) -> pd.DataFrame:
    """Per-indicator deprivation gaps in [0,1]; 1 = most deprived. NaN preserved."""
    gaps = pd.DataFrame(index=values.index)
    for code in values.columns:
        col = pd.to_numeric(values[code], errors="coerce")
        lo, hi = col.min(skipna=True), col.max(skipna=True)
        if pd.isna(lo) or hi == lo:
            gaps[code] = np.nan
            continue
        if direction.get(code) == "worse_high":
            gaps[code] = (col - lo) / (hi - lo)
        else:
            gaps[code] = (hi - col) / (hi - lo)
    return gaps


def priority_index(gaps: pd.DataFrame, weights: dict[str, float]) -> pd.Series:
    """Weighted mean per district, renormalized over that district's non-NaN indicators.

    Districts with no covered indicator get NaN (and are excluded by callers).
    """
    out = pd.Series(np.nan, index=gaps.index, dtype=float)
    codes = [c for c in gaps.columns if weights.get(c, 0) > 0]
    if not codes:
        return out
    sub = gaps[codes]
    w = np.array([weights[c] for c in codes], dtype=float)
    mask = sub.notna().to_numpy()
    num = np.nansum(np.where(mask, sub.to_numpy(), 0) * w, axis=1)
    den = (mask * w).sum(axis=1)
    covered = den > 0
    out.loc[covered] = num[covered] / den[covered]
    return out


# ------------------------------------------------------------------ allocation

def allocate(
    index: pd.Series, budget_rwf_m: float, floor_pct: float,
    population: pd.Series | None = None,
) -> pd.DataFrame:
    """Proportional allocation with a per-district floor (pct of equal split).

    Floor enforcement is iterative water-filling: districts whose proportional
    share falls below the floor are lifted to it and the excess is re-scaled
    across the rest. Largest-remainder rounding to 3 decimals keeps the table
    summing to the envelope exactly — auditable output.

    `population` (optional): when provided, allocation shares are also
    proportional to residents at equal need. Without it, behaviour is exactly
    the same as before — the displayed priority index is never re-scaled.
    """
    idx = index.dropna()
    n = len(idx)
    if n == 0 or budget_rwf_m <= 0:
        return pd.DataFrame(columns=["district", "adm2_pcode", "priority_index",
                                     "allocation_rwf_m", "share_pct"])
    weighted = idx
    if population is not None:
        pop = population.reindex(idx.index).astype(float).fillna(0.0)
        if (pop > 0).any():
            weighted = idx * (pop / pop[pop > 0].mean())
    share = weighted / weighted.sum()
    floor_share = (floor_pct / 100.0) / n
    if floor_share > 0:
        alloc = share.to_numpy(dtype=float).copy()
        for _ in range(100):
            low = alloc < floor_share
            if not low.any():
                break
            alloc[low] = floor_share
            excess = alloc.sum() - 1.0
            if excess <= 1e-12:
                break
            free = ~low
            if not free.any():
                break
            pool = alloc[free].sum()
            alloc[free] -= alloc[free] * (excess / pool)
        share = pd.Series(alloc, index=idx.index).clip(lower=0.0)
        share = share / share.sum()
    raw = share * budget_rwf_m
    alloc_amt = raw.round(3)
    n_bumps = int((budget_rwf_m - alloc_amt.sum()) * 1000 + (0.5 if budget_rwf_m >= alloc_amt.sum() else -0.5))
    if n_bumps != 0:  # deterministic largest-remainder correction
        order = (raw - alloc_amt).sort_values(ascending=n_bumps < 0).index
        step = 0.001 if n_bumps > 0 else -0.001
        for pcode in order[: abs(n_bumps)]:
            alloc_amt[pcode] = round(alloc_amt[pcode] + step, 3)
    codes = np.asarray(idx.index)
    out = pd.DataFrame({
        "district": codes,
        "adm2_pcode": codes,
        "priority_index": idx.to_numpy().round(4),
        "allocation_rwf_m": alloc_amt.to_numpy(),
    })
    out["share_pct"] = (out["allocation_rwf_m"] / budget_rwf_m * 100).round(2)
    return out.sort_values(["allocation_rwf_m", "adm2_pcode"], ascending=[False, True]).reset_index(drop=True)


# ------------------------------------------------------------------ typologies

def typologies(gaps: pd.DataFrame, k: int) -> tuple[pd.DataFrame, pd.DataFrame, float]:
    """KMeans typologies on standardized gaps + PCA(2) coordinates.

    Returns (members[pcode, cluster, x, y], profiles[cluster, mean_gaps, severity], silhouette).
    Cluster ids are renumbered 1..k by descending severity (1 = most deprived group).
    """
    X = gaps.dropna(axis=1, how="all").fillna(gaps.median())
    Xs = StandardScaler().fit_transform(X)
    km = KMeans(n_clusters=k, n_init=10, random_state=RANDOM_STATE).fit(Xs)
    coords = PCA(n_components=2, random_state=RANDOM_STATE).fit_transform(Xs)
    members = pd.DataFrame({"adm2_pcode": X.index, "cluster": km.labels_,
                            "x": coords[:, 0], "y": coords[:, 1]}).set_index("adm2_pcode")
    profile = X.groupby(km.labels_).mean()
    order = profile.mean(axis=1).sort_values(ascending=False).index
    renumber = {old: new + 1 for new, old in enumerate(order)}
    members["cluster"] = members["cluster"].map(renumber)
    prof = X.groupby(members.loc[X.index, "cluster"]).mean()
    prof.insert(0, "severity", prof.mean(axis=1))
    profile_df = prof.sort_values("severity", ascending=False).rename_axis("cluster").reset_index()
    silhouette = float(silhouette_score(Xs, km.labels_))
    return members.reset_index(), profile_df, silhouette


# ------------------------------------------------------------------ drivers

def driver_analysis(gaps: pd.DataFrame, target: str) -> tuple[pd.Series, float]:
    """Gradient-boost importances explaining the `target` gap from other gaps."""
    X = gaps.drop(columns=[target])
    y = gaps[target]
    fit_mask = X.notna().all(axis=1) & y.notna()
    X, y = X[fit_mask].fillna(X.median()), y[fit_mask]
    model = GradientBoostingRegressor(random_state=RANDOM_STATE).fit(X, y)
    imp = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
    return imp, float(model.score(X, y))


# ------------------------------------------------------------------ prediction

def predict_scenario(
    values: pd.DataFrame, target: str, district: str, scenario: dict[str, float]
) -> dict:
    """Counterfactual prediction in RAW units with a leave-one-out honesty report.

    Trains GradientBoostingRegressor(target ~ all other indicators) on
    complete-case districts, validates with LOO cross-validation, then predicts
    the district twice: as-observed (baseline) and with `scenario` overrides.
    Scenario values outside observed ranges are clipped and reported — the model
    must not extrapolate silently. Target is never a feature (no leakage).

    Returns dict with baseline/predicted/delta, clipped list, cv_r2, cv_mae,
    n_rows, n_features, importances {code: share}, and feature_ranges for UI
    sliders. Raises ValueError when data is insufficient.
    """
    features = [c for c in values.columns if c != target]
    if len(features) < 2:
        raise ValueError("not enough feature indicators to model " + target)
    fit = values[features + [target]].dropna()
    if len(fit) < MIN_PREDICT_ROWS:
        raise ValueError(f"only {len(fit)} complete districts — need {MIN_PREDICT_ROWS}+")
    if district not in fit.index:
        raise ValueError("district lacks complete data for prediction")
    X, y = fit[features], fit[target]

    loo_pred = cross_val_predict(
        GradientBoostingRegressor(random_state=RANDOM_STATE), X, y, cv=LeaveOneOut()
    )
    cv_r2 = float(r2_score(y, loo_pred))
    cv_mae = float(mean_absolute_error(y, loo_pred))

    model = GradientBoostingRegressor(random_state=RANDOM_STATE).fit(X, y)
    imp = pd.Series(model.feature_importances_, index=features).sort_values(ascending=False)

    ranges = {c: (float(X[c].min()), float(X[c].max())) for c in features}
    base = X.loc[district].copy()
    scen = base.copy()
    clipped: list[str] = []
    for code, raw in (scenario or {}).items():
        if code == target or code not in features:
            continue
        v = float(raw)
        if not np.isfinite(v):
            continue
        lo, hi = ranges[code]
        if v < lo or v > hi:
            clipped.append(code)
        scen[code] = min(hi, max(lo, v))

    baseline = float(model.predict(base.to_frame().T)[0])
    predicted = float(model.predict(scen.to_frame().T)[0])
    return {
        "baseline": round(baseline, 2),
        "predicted": round(predicted, 2),
        "delta": round(predicted - baseline, 2),
        "clipped": clipped,
        "cv_r2": round(cv_r2, 3),
        "cv_mae": round(cv_mae, 3),
        "n_rows": int(len(fit)),
        "n_features": int(len(features)),
        "importances": {c: round(float(v), 4) for c, v in imp.items()},
        "feature_ranges": {
            c: {"min": round(lo, 2), "max": round(hi, 2),
                "current": round(float(base[c]), 2)}
            for c, (lo, hi) in ranges.items()
        },
    }


# ------------------------------------------------------------------ neighbours

def nearest_neighbours(row: pd.Series, gaps: pd.DataFrame, top_n: int = 4) -> list[str]:
    other = gaps.dropna(axis=1, how="all")
    if row.name not in other.index:
        return []
    d = (other.sub(other.loc[row.name]) ** 2).mean(axis=1, skipna=True) ** 0.5
    d = d.drop(index=row.name, errors="ignore").dropna()
    return d.sort_values().head(top_n).index.tolist()
