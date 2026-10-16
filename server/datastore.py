"""DataStore — mtime-cached access to data/processed (+ geo), availability rules.

Everything the API serves is read from files on disk here. Re-running
scripts/build_dataset.py updates mtimes and the next request reloads.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from server.catalog import MIN_COVERAGE_PCT, INDICATORS
from server.schemas import Availability

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PROCESSED = DATA / "processed"
GEOJSON_PATH = DATA / "raw" / "geoboundaries" / "rwa_adm2.geojson"


def _exterior_points(geom: dict | None) -> list[list[float]]:
    """Flatten Polygon/MultiPolygon exterior rings into a point list."""
    if not geom:
        return []
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return []
    return [pt for poly in polys for pt in poly[0]]


class DataStore:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, object]] = {}

    # ---------------------------------------------------------------- helpers

    def _read(self, key: str, path: Path, loader):
        mtime = path.stat().st_mtime
        cached = self._cache.get(key)
        if cached and cached[0] == mtime:
            return cached[1]
        obj = loader(path)
        self._cache[key] = (mtime, obj)
        return obj

    def _read_csv(self, key: str, path: Path) -> pd.DataFrame | None:
        if not path.exists():
            return None
        return self._read(
            key, path,
            lambda p: pd.read_csv(p, dtype={"adm2_pcode": str, "district": str, "province": str}),
        )

    @staticmethod
    def _numeric_cols(df: pd.DataFrame) -> list[str]:
        return [c for c in df.columns
                if c not in ("district", "adm2_pcode", "province") and pd.api.types.is_numeric_dtype(df[c])]

    # ---------------------------------------------------------------- lookups

    def manifest(self) -> dict:
        return self._read("manifest", PROCESSED / "manifest.json",
                          lambda p: json.loads(p.read_text(encoding="utf-8")))

    @property
    def as_of(self) -> str:
        return str(self.manifest().get("generated_utc", ""))

    def districts(self) -> pd.DataFrame:
        df = self._read("districts", PROCESSED / "districts.csv", pd.read_csv)
        if df is None:
            raise FileNotFoundError("data/processed/districts.csv missing — run scripts/build_dataset.py")
        return df.assign(
            **{c: pd.to_numeric(df[c], errors="coerce") for c in self._numeric_cols(df)}
        )

    def combined(self) -> tuple[pd.DataFrame, list[str]]:
        """districts.csv + (joined) survey columns. Returns (df, join_report)."""
        base = self.districts()
        survey = self._read_csv("survey", PROCESSED / "survey_indicators.csv")
        if survey is None:
            return base, []
        report: list[str] = []
        survey = survey.copy()
        by_pcode = base.set_index("adm2_pcode")["district"].to_dict()
        names = base["district"].tolist()
        resolved = []
        for _, row in survey.iterrows():
            pcode = str(row.get("adm2_pcode") or "")
            name = str(row.get("district") or "")
            if pcode in by_pcode:
                resolved.append(pcode)
            else:
                close = [n for n in names if n.strip().lower() == name.strip().lower()]
                match = next((by_pcode[n] for n in close if n in by_pcode), None)
                if match is None:
                    report.append(f"survey row unmatched: district={name!r}")
                else:
                    resolved.append(match)
                if close:
                    report.append(f"survey row matched by name: {name!r} -> pcode {match}")
        survey["adm2_pcode"] = resolved
        keep = [c for c in survey.columns if c in INDICATORS or c in ("adm2_pcode", "population")]
        merged = base.merge(survey[keep], on="adm2_pcode", how="left", validate="one_to_one")
        return merged, report

    def availability(self) -> dict[str, Availability]:
        df, _ = self.combined()
        n = len(df)
        out: dict[str, Availability] = {}
        for code, meta in INDICATORS.items():
            if code not in df.columns:
                out[code] = Availability(available=False, coverage_pct=0.0, n_districts=0,
                                         reason=("fill data/raw/nisr/district_indicators_TEMPLATE.csv "
                                                 "and run scripts/build_dataset.py" if meta.served_from == "survey"
                                                 else "missing from data/processed/districts.csv"))
                continue
            col = pd.to_numeric(df[code], errors="coerce")
            coverage = float(col.notna().mean() * 100)
            var = float(col.dropna().var()) if col.notna().sum() > 1 else 0.0
            if coverage < MIN_COVERAGE_PCT:
                reason = f"coverage {coverage:.0f}% < {MIN_COVERAGE_PCT:.0f}%"
            elif var <= 0:
                reason = "indicator has no variance"
            else:
                reason = None
            out[code] = Availability(available=reason is None, coverage_pct=round(coverage, 1),
                                     n_districts=int(col.notna().sum()), reason=reason)
        return out

    def available_codes(self) -> list[str]:
        return [c for c, a in self.availability().items() if a.available]

    def geo(self) -> tuple[dict, dict[str, list[float]], dict[str, str]]:
        """(geojson, pcode->centroid [lon,lat], shapeName->pcode)."""
        def load(p: Path):
            gj = json.loads(p.read_text(encoding="utf-8"))
            centroids: dict[str, list[float]] = {}
            name_to_pcode: dict[str, str] = {}
            df = self.districts()
            by_name = {r["district"]: (r["adm2_pcode"], r["province"]) for _, r in df.iterrows()}
            for feat in gj["features"]:
                props = feat["properties"]
                name = (props.get("shapeName") or "").strip()
                hit = by_name.get(name)
                if hit is None:  # tolerate case-only differences
                    cand = {k.lower(): k for k in by_name}
                    lower = cand.get(name.lower())
                    hit = (by_name[lower][0], by_name[lower][1]) if lower else None
                props["adm2_pcode"] = hit[0] if hit else ""
                props["province"] = hit[1] if hit else ""
                if hit:
                    name_to_pcode[name] = hit[0]
                pts = _exterior_points(feat.get("geometry"))
                if pts and hit:
                    centroids[hit[0]] = [
                        round(sum(p[0] for p in pts) / len(pts), 5),
                        round(sum(p[1] for p in pts) / len(pts), 5),
                    ]
            return gj, centroids, name_to_pcode

        return self._read("geo", GEOJSON_PATH, load)

    def facilities(self, kind: str | None = None) -> pd.DataFrame:
        df = self._read("facilities", PROCESSED / "facilities.csv", pd.read_csv)
        if kind:
            df = df[df["kind"] == kind]
        return df

    def design_matrix(self, codes: list[str]) -> pd.DataFrame:
        """Values matrix indexed by adm2_pcode, no imputation here."""
        df, _ = self.combined()
        return df.set_index("adm2_pcode")[codes]
