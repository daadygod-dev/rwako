# Raw data sources

All sources are public, license-clean, and **$0 / no API keys**.

| File (under this dir) | Provider | License | What it gives us |
|---|---|---|---|
| `geoboundaries/rwa_adm2.geojson` | geoBoundaries (gbOpen RWA ADM2) | CC BY 4.0 | 30 district polygons + names (shapeName) |
| `nisr/rwa_gazetteer_rphc2012_v2.xlsx` | NISR RPHC2012 gazetteer (HDX COD-AB) | NISR open | official district ↔ province ↔ PCODE mapping |
| `nisr/district_indicators_TEMPLATE.csv` | team-filled | — | official NISR survey indicators per district |
| `osm/hotosm_rwa_health_facilities.geojson.zip` | OpenStreetMap via HDX | ODbL | 1,372 health facilities (typed by `amenity`) |
| `osm/hotosm_rwa_education_facilities.geojson.zip` | OpenStreetMap via HDX | ODbL | education facilities (thin coverage — proxy only) |
| `fews_net/ipc_2023_04.geojson` | FEWS NET (IPC phase maps) | open | food-security phases (country-level in recent periods) |

## Download commands (re-runnable)

```bash
# boundaries
curl -sL --retry 2 -o data/raw/geoboundaries/rwa_adm2.geojson \
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RWA/ADM2/geoBoundaries-RWA-ADM2_simplified.geojson"

# NISR gazetteer (via HDX COD-AB)
curl -sL -o data/raw/nisr/rwa_gazetteer_rphc2012_v2.xlsx \
  "https://data.humdata.org/dataset/2768bdfd-6486-4963-8e3d-e63149478eb4/resource/95b0f509-7bbb-44cb-a783-92c8208fdfea/download/rwa_gazetteer_rphc2012_v2.xlsx"

# OSM facilities
curl -sL -o data/raw/osm/hotosm_rwa_health_facilities.geojson.zip \
  "https://production-raw-data-api.s3.amazonaws.com/ISO3/RWA/health_facilities/hotosm_rwa_health_facilities_osm_geojson.zip"
curl -sL -o data/raw/osm/hotosm_rwa_education_facilities.geojson.zip \
  "https://production-raw-data-api.s3.amazonaws.com/ISO3/RWA/education_facilities/hotosm_rwa_education_facilities_osm_geojson.zip"
```

## NISR indicators (manual step, the evaluation-critical part)

NISR publishes district-level indicator values in the EICV / DHS / Census outputs
(statistics.gov.rw — Excel/PDF). Fill the blank columns of
`district_indicators_TEMPLATE.csv` from those publications (cite the exact table per
column in `data/processed/manifest.json.sources`). Then rename the file
`district_indicators_official.csv` and re-run the build — the API/UI picks it up
automatically, and real values displace OSM-derived proxies where they overlap.

## Rebuild processed dataset

```bash
python scripts/build_dataset.py   # stdlib only, offline, deterministic
```
