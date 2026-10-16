"""Build the processed district dataset from raw downloads — stdlib only.

Inputs (data/raw/):
- geoboundaries/rwa_adm2.geojson   : GeoBoundaries RWA ADM2 (CC BY 4.0)
- nisr/rwa_gazetteer_rphc2012_v2.xlsx : NISR RPHC2012 gazetteer (official codes)
- osm/hotosm_rwa_health_facilities.geojson.zip : OSM health facilities (ODbL)
- osm/hotosm_rwa_education_facilities.geojson.zip : OSM education facilities (ODbL)

Outputs (data/processed/):
- districts.csv      : one row per district — codes, province, area, facility densities
- facilities.csv     : every facility mapped to its district (audit trail)
- manifest.json      : provenance, licenses, generation timestamp

No external services are contacted at build time.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import math
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

EARTH_R = 6371.0088  # km


def ring_area_2d(ring: list[list[float]]) -> float:
    """Approximate geodesic area (km^2) of a lon/lat ring: shoelace formula
    with a cos(latitude) longitudinal correction."""
    if len(ring) < 3:
        return 0.0
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    k = math.cos(lat0)
    pts = [(math.radians(p[0]) * k, math.radians(p[1])) for p in ring]
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) * EARTH_R * EARTH_R / 2


def polygon_area(geom: dict | None) -> float:
    """Area in km^2 for Polygon or MultiPolygon (holes subtracted)."""
    if geom is None:
        return 0.0
    if geom["type"] == "Polygon":
        rings = geom["coordinates"]
        return ring_area_2d(rings[0]) - sum(ring_area_2d(h) for h in rings[1:])
    if geom["type"] == "MultiPolygon":
        return sum(polygon_area({"type": "Polygon", "coordinates": poly})
                   for poly in geom["coordinates"])
    return 0.0


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geometry(lon: float, lat: float, geom: dict) -> bool:
    if geom["type"] == "Polygon":
        return point_in_ring(lon, lat, geom["coordinates"][0]) and not any(
            point_in_ring(lon, lat, hole) for hole in geom["coordinates"][1:]
        )
    if geom["type"] == "MultiPolygon":
        return any(
            point_in_ring(lon, lat, poly[0])
            and not any(point_in_ring(lon, lat, h) for h in poly[1:])
            for poly in geom["coordinates"]
        )
    return False


def load_geojson(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_zipped_geojson(path: Path) -> dict:
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(".geojson"))
        return json.loads(z.read(name).decode("utf-8"))


def classify_health(props: dict) -> str:
    return props.get("amenity") or props.get("healthcare") or "unknown"


def classify_education(props: dict) -> str:
    return (props.get("amenity") or props.get("building")
            or props.get("education_type") or "unknown")


def load_gazetteer(path: Path) -> dict[str, tuple[str, str]]:
    """district -> (province, ADM2 pcode) from the NISR RPHC2012 gazetteer."""
    mapping: dict[str, tuple[str, str]] = {}
    try:
        import openpyxl
        ws = openpyxl.load_workbook(path, read_only=True)["ADM2"]
        for row in ws.iter_rows(values_only=True):
            district, pcode, province = row[9], row[10], row[5]
            if district and pcode:
                mapping[str(district).strip()] = (str(province).strip(), str(pcode))
    except Exception as exc:
        print(f"[warn] gazetteer skipped: {exc}")
    return mapping


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    geo = load_geojson(RAW / "geoboundaries" / "rwa_adm2.geojson")
    gazetteer = load_gazetteer(RAW / "nisr" / "rwa_gazetteer_rphc2012_v2.xlsx")

    # 1. District master table.
    districts: list[dict] = []
    geom_by_name: dict[str, dict] = {}
    for f in geo["features"]:
        p = f["properties"]
        name = (p.get("shapeName") or "").strip()
        province, pcode = gazetteer.get(name, ("", ""))
        districts.append({
            "district": name,
            "adm2_pcode": pcode,
            "province": province,
        })
        geom_by_name[name] = f["geometry"]

    # 2. Facilities -> district via point-in-polygon (audit trail + counts).
    sources = [
        (RAW / "osm" / "hotosm_rwa_health_facilities.geojson.zip", "health", classify_health),
        (RAW / "osm" / "hotosm_rwa_education_facilities.geojson.zip", "education", classify_education),
    ]
    facility_rows: list[dict] = []
    counts: dict[str, dict[str, int]] = {d["district"]: {"health": 0, "education": 0} for d in districts}
    unmatched = 0
    for path, kind, classify in sources:
        if not path.exists():
            print(f"[warn] missing {path.name}, skipping {kind} counts")
            continue
        gj = load_zipped_geojson(path)
        for feat in gj["features"]:
            geom = feat.get("geometry")
            props = feat.get("properties") or {}
            if not geom or geom["type"] != "Point":
                continue
            lon, lat = geom["coordinates"][:2]
            hit = None
            for name, g in geom_by_name.items():
                if point_in_geometry(lon, lat, g):
                    hit = name
                    break
            if hit is None:
                unmatched += 1
                continue
            counts.setdefault(hit, {"health": 0, "education": 0})[kind] += 1
            facility_rows.append({
                "district": hit, "kind": kind, "type": classify(props),
                "name": props.get("name") or "", "lon": round(lon, 6), "lat": round(lat, 6),
            })

    # 3. Areas + service densities.
    for d in districts:
        name = d["district"]
        area = polygon_area(geom_by_name.get(name))
        d["area_km2"] = round(area, 1)
        d["health_facilities"] = counts[name]["health"]
        d["education_facilities"] = counts[name]["education"]
        d["health_per_1000km2"] = round(counts[name]["health"] * 1000 / area, 2) if area else ""
        d["education_per_1000km2"] = round(counts[name]["education"] * 1000 / area, 2) if area else ""

    # 4. Emit.
    fields = ["district", "adm2_pcode", "province", "area_km2",
              "health_facilities", "education_facilities",
              "health_per_1000km2", "education_per_1000km2"]
    with (OUT / "districts.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(districts)

    with (OUT / "facilities.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["district", "kind", "type", "name", "lon", "lat"])
        w.writeheader()
        w.writerows(facility_rows)

    manifest = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "districts": len(districts),
        "facilities": len(facility_rows),
        "facilities_unmatched": unmatched,
        "sources": {
            "boundaries": {
                "file": "data/raw/geoboundaries/rwa_adm2.geojson",
                "provider": "geoBoundaries (gbOpen RWA ADM2)", "license": "CC BY 4.0",
                "url": "https://www.geoboundaries.org",
            },
            "gazetteer": {
                "file": "data/raw/nisr/rwa_gazetteer_rphc2012_v2.xlsx",
                "provider": "NISR RPHC2012 gazetteer (via HDX COD-AB)",
                "license": "NISR open data (CC BY 4.0 default)",
                "url": "https://data.humdata.org/dataset/cod-ab-rwa",
            },
            "health_facilities": {
                "file": "data/raw/osm/hotosm_rwa_health_facilities.geojson.zip",
                "provider": "OpenStreetMap via HDX", "license": "ODbL",
                "url": "https://data.humdata.org/dataset/hotosm_rwa_health_facilities",
            },
            "education_facilities": {
                "file": "data/raw/osm/hotosm_rwa_education_facilities.geojson.zip",
                "provider": "OpenStreetMap via HDX", "license": "ODbL",
                "url": "https://data.humdata.org/dataset/hotosm_rwa_education_facilities",
            },
            "food_security_ipc": {
                "file": "data/raw/fews_net/ipc_2023_04.geojson",
                "provider": "FEWS NET IPC (country-level phases)", "license": "open",
                "url": "https://fews.net",
            },
        },
        "notes": [
            "Densities use geodesic polygon areas (shoelace + cos-lat correction, km^2).",
            "OSM completeness varies by district; treat as service-presence proxies.",
            "NISR survey indicators (poverty, literacy, stunting, electrification...) "
            "are a manual drop-in CSV template: data/raw/nisr/district_indicators_TEMPLATE.csv",
        ],
    }
    # 5. Survey indicators (Phase B): join the official NISR drop-in when it exists.
    survey_note = "not filled yet — district_indicators_OFFICIAL.csv missing"
    official = RAW / "nisr" / "district_indicators_OFFICIAL.csv"
    if official.exists():
        import re
        with official.open(encoding="utf-8-sig", newline="") as fh:
            survey = list(csv.DictReader(fh))
        if survey:
            keyed = {d["district"]: d["adm2_pcode"] for d in districts}
            byname_norm = {k.strip().lower(): v for k, v in keyed.items()}
            matched = 0
            for row in survey:
                name = (row.get("district") or "").strip()
                pcode = keyed.get(name) or byname_norm.get(name.lower())
                if pcode:
                    row["adm2_pcode"] = pcode
                    matched += 1
            out_fields = list(survey[0].keys())
            if "adm2_pcode" not in out_fields:
                out_fields.append("adm2_pcode")
            with (OUT / "survey_indicators.csv").open("w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=out_fields)
                w.writeheader()
                w.writerows(survey)
            survey_note = f"official NISR CSV joined: {matched}/{len(survey)} rows matched to pcodes"
            if matched < len(survey):
                survey_note += " (unmatched rows listed in join report)"
                print(f"[warn] survey join: matched only {matched}/{len(survey)}")
    manifest["survey"] = survey_note

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"OK: {len(districts)} districts, {len(facility_rows)} facilities "
          f"({unmatched} unmatched), area total {sum(polygon_area(g) for g in geom_by_name.values()):,.0f} km2")
    print(f"survey: {survey_note}")


if __name__ == "__main__":
    main()
