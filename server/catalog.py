"""Indicator catalog — the single source of truth for indicator metadata.

`served_from`:
  - "derived": present in data/processed/districts.csv (Phase A today)
  - "survey":  comes from survey_indicators.csv (NISR template filled by the team)
"""

from __future__ import annotations

from pydantic import BaseModel


class IndicatorMeta(BaseModel):
    code: str
    label: str
    unit: str
    direction: str  # "worse_high" | "better_high"
    pillar: str
    served_from: str
    source: str


INDICATORS: dict[str, IndicatorMeta] = {
    meta.code: meta
    for meta in [
        IndicatorMeta(code="health_per_1000km2", label="Health facilities", unit="per 1,000 km²",
                      direction="better_high", pillar="Health Infrastructure",
                      served_from="derived", source="OpenStreetMap via HDX (ODbL)"),
        IndicatorMeta(code="education_per_1000km2", label="Education facilities", unit="per 1,000 km²",
                      direction="better_high", pillar="Education Infrastructure",
                      served_from="derived", source="OpenStreetMap via HDX (ODbL)"),
        IndicatorMeta(code="poverty_rate", label="Poverty rate", unit="% of households",
                      direction="worse_high", pillar="Wellbeing & Social Protection",
                      served_from="survey", source="NISR EICV (fill data/raw/nisr/district_indicators_official.csv)"),
        IndicatorMeta(code="stunting_rate", label="Child stunting (under 5)", unit="% of children",
                      direction="worse_high", pillar="Health",
                      served_from="survey", source="NISR DHS/EICV"),
        IndicatorMeta(code="adult_literacy_rate", label="Adult literacy (15+)", unit="% of adults",
                      direction="better_high", pillar="Education & Human Capital",
                      served_from="survey", source="NISR EICV"),
        IndicatorMeta(code="net_secondary_enrollment", label="Net secondary enrollment", unit="%",
                      direction="better_high", pillar="Education & Human Capital",
                      served_from="survey", source="NISR EICV"),
        IndicatorMeta(code="electricity_access", label="Electricity access", unit="% of households",
                      direction="better_high", pillar="Infrastructure & Energy",
                      served_from="survey", source="NISR EICV/Census"),
        IndicatorMeta(code="improved_water_access", label="Improved water access", unit="% of households",
                      direction="better_high", pillar="Infrastructure & Energy",
                      served_from="survey", source="NISR EICV"),
        IndicatorMeta(code="health_insurance_coverage", label="Health insurance (CBHI)", unit="% of households",
                      direction="better_high", pillar="Health",
                      served_from="survey", source="NISR EICV"),
        IndicatorMeta(code="food_security", label="Food security (adequate)", unit="% of households",
                      direction="better_high", pillar="Agriculture & Food Systems",
                      served_from="survey", source="NISR CFSVA"),
        IndicatorMeta(code="access_to_credit", label="Access to credit", unit="% of households",
                      direction="better_high", pillar="Digital & Financial Inclusion",
                      served_from="survey", source="NISR Finscope/EICV"),
    ]
}

DEFAULT_WEIGHTS: dict[str, float] = {code: 1.0 for code in INDICATORS}
MIN_COVERAGE_PCT = 90.0  # indicators below this coverage are excluded from analytics
WEIGHT_MIN, WEIGHT_MAX = 0.0, 5.0
K_MIN, K_MAX = 2, 6
