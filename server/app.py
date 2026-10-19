"""Rwanda Compass API — serves data/processed to the custom UI.

Run from repo root:  uvicorn server.app:app --reload
Docs:                http://127.0.0.1:8000/docs

App rules (docs/SYSTEM_DESIGN.md):
- only coverage-gated (>=90%) indicators enter any computation;
- weights are renormalized per district over non-NaN indicators — no fake imputation;
- every response is stamped `as_of` from the data manifest.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from server import datastore as ds
from server.catalog import DEFAULT_WEIGHTS, INDICATORS
from server.schemas import (
    AllocationRequest, AllocationResponse, AllocationRow, AskRequest, AskResponse,
    ClusterMember,
    ClusterProfile, DistrictDetailResponse, DistrictRow, DriversRequest,
    DriversResponse, DriverOut, HealthResponse, IndexRequest, IndexResponse,
    IndexRow, IndicatorOut, PredictRequest, PredictResponse, ProvenanceResponse, TypologiesRequest,
    TypologiesResponse,
)
from server.services import analytics as A

try:
    from dotenv import load_dotenv

    # Explicit repo-root path: works no matter which folder uvicorn starts in.
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

app = FastAPI(title="Rwanda Compass API", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv(
        "FRONTEND_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,https://rwako.vercel.app").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

STORE = ds.DataStore()


@app.exception_handler(HTTPException)
async def http_problem(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={
        "type": "about:blank", "title": "Request failed",
        "status": exc.status_code, "detail": exc.detail,
    })


def _weights(request_weights: dict[str, float]) -> dict[str, float]:
    return {**DEFAULT_WEIGHTS, **request_weights}


def _index_gaps(weights: dict[str, float]) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """(values, gaps-over-available-codes, priority index)."""
    df, _ = STORE.combined()
    values = df.set_index("adm2_pcode")
    codes = STORE.available_codes()
    if not codes:
        raise HTTPException(406, "no indicators available — check data/processed/")
    gaps = A.gap_matrix(values[list(codes)], {c: m.direction for c, m in INDICATORS.items() if c in codes})
    idx = A.priority_index(gaps, {c: weights.get(c, 0) for c in gaps.columns})
    return values, gaps, idx


def _require_available(code: str) -> None:
    avail = STORE.availability().get(code)
    if avail is None or not avail.available:
        raise HTTPException(406, f"indicator {code!r} not available: {avail.reason if avail else 'unknown'}")


# ------------------------------------------------------------------ meta

@app.get("/api/v1/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", as_of=STORE.as_of, n_districts=len(STORE.districts()))


@app.get("/api/v1/manifest", response_model=ProvenanceResponse)
def manifest() -> ProvenanceResponse:
    m = STORE.manifest()
    return ProvenanceResponse(as_of=STORE.as_of, n_districts=int(m.get("districts", 0)),
                              n_facilities=int(m.get("facilities", 0)),
                              sources=m.get("sources", {}), notes=m.get("notes", []))


@app.get("/api/v1/indicators", response_model=list[IndicatorOut])
def indicators() -> list[IndicatorOut]:
    avail = STORE.availability()
    return [IndicatorOut(code=m.code, label=m.label, unit=m.unit, direction=m.direction,
                         pillar=m.pillar, served_from=m.served_from, source=m.source,
                         default_weight=DEFAULT_WEIGHTS[m.code], availability=avail[m.code])
            for m in INDICATORS.values()]


@app.get("/api/v1/geo")
def geo() -> JSONResponse:
    gj, _, _ = STORE.geo()
    return JSONResponse(gj)


# ------------------------------------------------------------------ districts

@app.get("/api/v1/districts", response_model=list[DistrictRow])
def districts() -> list[DistrictRow]:
    df, _ = STORE.combined()
    served = STORE.available_codes()
    rows = []
    for _, r in df.iterrows():
        rows.append(DistrictRow(
            district=r["district"], adm2_pcode=r["adm2_pcode"], province=r["province"],
            area_km2=None if pd.isna(r.get("area_km2")) else round(float(r["area_km2"]), 1),
            values={c: (None if pd.isna(r[c]) else round(float(r[c]), 4)) for c in served},
        ))
    return rows


@app.get("/api/v1/districts/{pcode}", response_model=DistrictDetailResponse)
def district_detail(pcode: str) -> DistrictDetailResponse:
    values, gaps, _ = _index_gaps(DEFAULT_WEIGHTS)
    if pcode not in values.index:
        raise HTTPException(404, f"unknown district pcode {pcode!r}")
    with_weights = {**DEFAULT_WEIGHTS}
    idx = A.priority_index(gaps, {c: with_weights.get(c, 0) for c in gaps.columns})
    served = list(gaps.columns)
    row_vals, row_gaps = values.loc[pcode], gaps.loc[pcode]
    base = STORE.districts().set_index("adm2_pcode")
    return DistrictDetailResponse(
        as_of=STORE.as_of,
        district=str(row_vals["district"]), adm2_pcode=pcode, province=str(row_vals["province"]),
        priority_index=round(float(idx[pcode]), 4),
        rank=int(idx.rank(ascending=False)[pcode]), of=int(idx.notna().sum()),
        median=round(float(idx.median()), 4),
        values={c: (None if pd.isna(row_vals[c]) else round(float(row_vals[c]), 4)) for c in served},
        gaps={c: (None if pd.isna(row_gaps[c]) else round(float(row_gaps[c]), 4)) for c in served},
        median_gaps={c: (None if gaps[c].dropna().empty else round(float(gaps[c].median()), 4)) for c in served},
        neighbours=A.nearest_neighbours(row_gaps[served], gaps[served]),
        facilities=int(base.loc[pcode, "health_facilities"]),
        schools=int(base.loc[pcode, "education_facilities"]),
    )


# ------------------------------------------------------------------ analysis

@app.post("/api/v1/analysis/index", response_model=IndexResponse)
def analysis_index(req: IndexRequest) -> IndexResponse:
    values, gaps, idx = _index_gaps(_weights(req.weights))
    ranked = idx.dropna().sort_values(ascending=False)
    if ranked.empty:
        raise HTTPException(406, "no indicator coverage — cannot compute index")
    active = list(gaps.columns)
    return IndexResponse(
        as_of=STORE.as_of, indicators_used=active,
        gaps={pcode: {c: (None if pd.isna(gaps.loc[pcode, c]) else round(float(gaps.loc[pcode, c]), 4))
                      for c in active} for pcode in values.index},
        ranking=[IndexRow(rank=i + 1, district=str(values.loc[p]["district"]), adm2_pcode=p,
                          province=str(values.loc[p]["province"]), priority_index=round(float(v), 4))
                 for i, (p, v) in enumerate(ranked.items())],
    )


@app.post("/api/v1/analysis/allocate", response_model=AllocationResponse)
def analysis_allocate(req: AllocationRequest) -> AllocationResponse:
    values, _, idx = _index_gaps(_weights(req.weights))
    if idx.dropna().empty:
        raise HTTPException(406, "no indicator coverage — nothing to allocate")
    # Opt-in per-capita fairness: when the dataset carries a population column,
    # allocation shares are also proportional to residents. Displayed priority
    # index stays the need index either way.
    pop = None
    if "population" in values.columns and values["population"].notna().any():
        pop = values["population"]
    alloc = A.allocate(idx, req.budget_rwf_m, req.floor_pct, population=pop)
    name_by_pcode = values["district"].to_dict()
    province_by_pcode = values["province"].to_dict()
    return AllocationResponse(
        as_of=STORE.as_of, budget_rwf_m=req.budget_rwf_m, floor_pct=req.floor_pct,
        rows=[AllocationRow(rank=i + 1, district=str(name_by_pcode[r.adm2_pcode]),
                            adm2_pcode=r.adm2_pcode, province=str(province_by_pcode[r.adm2_pcode]),
                            priority_index=float(r.priority_index),
                            allocation_rwf_m=float(r.allocation_rwf_m), share_pct=float(r.share_pct))
              for i, r in enumerate(alloc.itertuples(index=False))],
    )


@app.post("/api/v1/analysis/typologies", response_model=TypologiesResponse)
def analysis_typologies(req: TypologiesRequest) -> TypologiesResponse:
    _, gaps, _ = _index_gaps(DEFAULT_WEIGHTS)
    members, profiles, silhouette = A.typologies(gaps, req.k)
    df, _ = STORE.combined()
    meta = df.set_index("adm2_pcode")[["district", "province"]]
    return TypologiesResponse(
        as_of=STORE.as_of, indicators_used=list(gaps.columns), silhouette=round(silhouette, 4),
        members=[ClusterMember(district=str(meta.loc[r.adm2_pcode, "district"]),
                               adm2_pcode=r.adm2_pcode, province=str(meta.loc[r.adm2_pcode, "province"]),
                               cluster=int(r.cluster), x=round(float(r.x), 4), y=round(float(r.y), 4))
                 for r in members.itertuples(index=False)],
        profiles=[ClusterProfile(cluster=int(r["cluster"]), severity=round(float(r["severity"]), 4),
                                 mean_gaps={c: round(float(v), 4) for c, v in r.items()
                                            if c not in ("cluster", "severity")})
                  for _, r in profiles.iterrows()],
    )


@app.post("/api/v1/analysis/drivers", response_model=DriversResponse)
def analysis_drivers(req: DriversRequest) -> DriversResponse:
    _require_available(req.target)
    _, gaps, _ = _index_gaps(DEFAULT_WEIGHTS)
    if gaps.drop(columns=[req.target]).shape[1] < 2:
        raise HTTPException(406, "not enough available indicators for driver analysis")
    imp, r2 = A.driver_analysis(gaps, req.target)
    return DriversResponse(
        as_of=STORE.as_of, target=req.target, target_label=INDICATORS[req.target].label,
        r2=round(r2, 4), n_features=int(len(imp)),
        drivers=[DriverOut(code=c, label=INDICATORS[c].label, importance=round(float(v), 4))
                 for c, v in imp.items()],
    )


@app.post("/api/v1/analysis/ask", response_model=AskResponse)
def analysis_ask(req: AskRequest) -> AskResponse:
    from server.services import assistant as ASM

    try:
        out = ASM.answer(
            req.message,
            [{"role": m.role, "content": m.content} for m in req.history],
            _weights(req.weights),
        )
    except ASM.NoKeyError:
        raise HTTPException(503, "assistant unavailable: GROQ_API_KEY is not set on the server")
    except ASM.ProviderError as exc:
        raise HTTPException(502, f"assistant provider error: {exc}")
    return AskResponse(
        as_of=STORE.as_of,
        answer=out["answer"],
        sources=out["sources"],
        suggested_weights=out["suggested_weights"],
        weights_note=out["weights_note"],
        visual=out.get("visual"),
        follow_ups=out.get("follow_ups", []),
        recommendations=out.get("recommendations", []),
    )


@app.post("/api/v1/analysis/predict", response_model=PredictResponse)
def analysis_predict(req: PredictRequest) -> PredictResponse:
    _require_available(req.target)
    df, _ = STORE.combined()
    values = df.set_index("adm2_pcode")
    codes = STORE.available_codes()
    if req.adm2_pcode not in values.index:
        raise HTTPException(404, f"unknown district pcode {req.adm2_pcode!r}")
    try:
        out = A.predict_scenario(values[list(codes)], req.target, req.adm2_pcode, req.scenario)
    except ValueError as exc:
        raise HTTPException(406, str(exc))
    meta = INDICATORS[req.target]
    top = sorted(out["importances"].items(), key=lambda kv: -kv[1])[:5]
    return PredictResponse(
        as_of=STORE.as_of, target=req.target, target_label=meta.label, unit=meta.unit,
        district=str(values.loc[req.adm2_pcode, "district"]), adm2_pcode=req.adm2_pcode,
        baseline=out["baseline"], predicted=out["predicted"], delta=out["delta"],
        clipped=out["clipped"], cv_r2=out["cv_r2"], cv_mae=out["cv_mae"],
        n_rows=out["n_rows"], n_features=out["n_features"],
        top_drivers=[DriverOut(code=c, label=INDICATORS[c].label, importance=v) for c, v in top],
        feature_ranges=out["feature_ranges"],
    )
