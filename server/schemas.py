"""Request/response schemas — validated at the boundary, everything typed."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from server.catalog import INDICATORS, K_MAX, K_MIN, WEIGHT_MAX, WEIGHT_MIN


def _validate_weights(weights: dict[str, float]) -> None:
    for code, w in weights.items():
        if code not in INDICATORS:
            raise ValueError(f"unknown indicator code: {code!r}")
        if not (WEIGHT_MIN <= w <= WEIGHT_MAX):
            raise ValueError(f"weight for {code!r} must be within [{WEIGHT_MIN}, {WEIGHT_MAX}], got {w}")


class IndexRequest(BaseModel):
    """Body shape: {"weights": {"<indicator_code>": 0..5}} (validated)."""
    weights: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self) -> "IndexRequest":
        _validate_weights(self.weights)
        return self


class AllocationRequest(BaseModel):
    weights: dict[str, float] = Field(default_factory=dict)
    budget_rwf_m: float = Field(gt=0)
    floor_pct: float = Field(default=0, ge=0, le=50)

    @model_validator(mode="after")
    def _check(self) -> "AllocationRequest":
        _validate_weights(self.weights)
        return self


class TypologiesRequest(BaseModel):
    k: int = Field(ge=K_MIN, le=K_MAX)


class DriversRequest(BaseModel):
    target: str

    @model_validator(mode="after")
    def _check(self) -> "DriversRequest":
        if self.target not in INDICATORS:
            raise ValueError(f"unknown target indicator: {self.target!r}")
        return self


class PredictRequest(BaseModel):
    target: str
    adm2_pcode: str
    scenario: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self) -> "PredictRequest":
        if self.target not in INDICATORS:
            raise ValueError(f"unknown target indicator: {self.target!r}")
        for code, v in self.scenario.items():
            if code not in INDICATORS:
                raise ValueError(f"unknown scenario indicator: {code!r}")
            if code == self.target:
                raise ValueError("scenario must not include the target itself")
            if not (-1e12 < v < 1e12):
                raise ValueError(f"scenario value for {code!r} is not finite")
        return self


class PredictResponse(BaseModel):
    as_of: str
    target: str
    target_label: str
    unit: str
    district: str
    adm2_pcode: str
    baseline: float
    predicted: float
    delta: float
    clipped: list[str]
    cv_r2: float
    cv_mae: float
    n_rows: int
    n_features: int
    top_drivers: list[DriverOut]
    feature_ranges: dict[str, dict[str, float]]
    caveat: str = (
        "Counterfactual from observational data, not causal proof. "
        "Validated leave-one-out; scenario values are clipped to observed ranges."
    )


class Availability(BaseModel):
    available: bool
    coverage_pct: float
    n_districts: int
    reason: str | None = None


class IndicatorOut(BaseModel):
    code: str
    label: str
    unit: str
    direction: str
    pillar: str
    served_from: str
    source: str
    default_weight: float
    availability: Availability


class DistrictRow(BaseModel):
    district: str
    adm2_pcode: str
    province: str
    area_km2: float | None = None
    values: dict[str, float | None]


class DistrictOut(BaseModel):
    district: str
    adm2_pcode: str
    province: str
    centroid: list[float]
    gap: dict[str, float | None]


class IndexRow(BaseModel):
    rank: int
    district: str
    adm2_pcode: str
    province: str
    priority_index: float


class IndexResponse(BaseModel):
    as_of: str
    indicators_used: list[str]
    gaps: dict[str, dict[str, float | None]]  # pcode -> code -> gap
    ranking: list[IndexRow]


class AllocationRow(BaseModel):
    rank: int
    district: str
    adm2_pcode: str
    province: str
    priority_index: float
    allocation_rwf_m: float
    share_pct: float


class AllocationResponse(BaseModel):
    as_of: str
    budget_rwf_m: float
    floor_pct: float
    rows: list[AllocationRow]


class ClusterMember(BaseModel):
    district: str
    adm2_pcode: str
    province: str
    cluster: int
    x: float  # PCA 1
    y: float  # PCA 2


class ClusterProfile(BaseModel):
    cluster: int
    severity: float
    mean_gaps: dict[str, float]


class TypologiesResponse(BaseModel):
    as_of: str
    indicators_used: list[str]
    silhouette: float
    members: list[ClusterMember]
    profiles: list[ClusterProfile]


class DriverOut(BaseModel):
    code: str
    label: str
    importance: float


class DriversResponse(BaseModel):
    as_of: str
    target: str
    target_label: str
    r2: float
    n_features: int
    drivers: list[DriverOut]
    caveat: str = "Importances describe companion indicators of the target, not causal effects."


class DistrictDetailResponse(BaseModel):
    as_of: str
    district: str
    adm2_pcode: str
    province: str
    priority_index: float
    rank: int
    of: int
    median: float
    values: dict[str, float | None]
    gaps: dict[str, float | None]
    median_gaps: dict[str, float | None]
    neighbours: list[str]
    facilities: int
    schools: int


class HealthResponse(BaseModel):
    status: str
    as_of: str
    n_districts: int


class ProvenanceResponse(BaseModel):
    as_of: str
    n_districts: int
    n_facilities: int
    sources: dict[str, Any]
    notes: list[str]


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class AskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    weights: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self) -> "AskRequest":
        _validate_weights(self.weights)
        return self


class AskResponse(BaseModel):
    as_of: str
    answer: str
    sources: list[str]
    suggested_weights: dict[str, float] | None = None
    weights_note: str | None = None
    visual: dict[str, Any] | None = None
