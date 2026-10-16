# Rwanda Compass — District Development Intelligence Platform 🇷🇺

> NISR 2026 Big Data Hackathon — **Track 3: Open Innovation**
> *"Develop innovative applications or solutions tackling national priorities as per NST2, Vision 2050."*

## 🎯 Problem

Rwanda's 30 districts start from very different places on the road to Vision 2050. Planners must
decide **where limited budgets create the most value first** — but evidence is scattered across
NISR publications and open sources, in formats that don't compare easily.

## 💡 Solution

A web platform that (1) unifies district development indicators from NISR + open sources,
(2) computes a **transparent, weight-configurable Priority Index** per district,
(3) applies **ML** to segment districts into intervention typologies and surface drivers,
and (4) **simulates budget allocation** proportional to need — a tool for Imihigo-style planning.

## ✅ $0 Stack (no paid services, no API keys)

| Layer | Tech | Free hosting |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript + Tailwind + HeroUI + @gravity-ui/icons + Recharts + react-globe.gl (3D globe)** | Vercel free tier |
| Backend API | Python FastAPI (stdlib data layer; coverage-gated ML) | Render / Railway / Fly.io free tier |
| Data | NISR + geoBoundaries + OSM/HDX + DHS API (all public, license-checked) | committed to repo (`data/processed/`) |
| ML | scikit-learn (K-Means typologies, gradient-boosting drivers) | runs in the free-tier backend |

## 📦 Data pipeline (done)

```
data/raw/                download + manual NISR drop-ins (see data/raw/README.md)
scripts/build_dataset.py stdlib-only builder: spatial join, areas, densities, provenance
data/processed/          districts.csv · facilities.csv · manifest.json  ← the ML-parseable product
```

Current processed dataset (real, verified):
- **30 districts** with official NISR PCODEs + provinces
- **1,485 facilities** mapped to districts (0 unmatched) → health & education `per_1000km2` densities
- geodesic polygon areas (25,428 km² total — within boundary-simplification tolerance)
- full provenance manifest (provider + license + URL per source)

## 🗺️ API design (backend serves the UI)

```
GET /api/districts          → districts.csv as JSON
GET /api/facilities         → facilities.csv (map layer)
GET /api/manifest           → provenance
POST /api/priority-index    → {weights} → per-district index + ranking
POST /api/allocate          → {budget, weights, floor} → allocation per district
POST /api/typologies        → {k} → K-Means clusters + PCA coords
POST /api/drivers           → {target} → feature importances (survey data)
```

## 🚀 Run

```bash
python scripts/build_dataset.py                 # rebuild data product
python -m pytest server/tests -q                # analytics + API contract tests (15)
uvicorn server.app:app --reload                 # API on http://127.0.0.1:8000 — docs at /docs
# frontend (next sprint):  cd web && npm run dev
```

Frontend origin: set `FRONTEND_ORIGINS` env var (default `http://localhost:5173,http://127.0.0.1:5173`).

## 🔭 Roadmap

- [x] M1 — Data sources downloaded, license-verified, processed into ML-ready files
- [x] M2a — FastAPI backend (schema-validated, coverage-gated ML, 15 tests, real-data smoke run)
- [ ] M2b — Next.js + HeroUI web app (3D globe, 2D choropleth, index builder, typologies, drivers, allocator)
- [ ] M3 — Fill `district_indicators_TEMPLATE.csv` from NISR statbooks → ML indicators live
- [ ] M4 — Deploy (Vercel + Render free tier), methodology doc, demo video, GitHub cleanup

## 🤖 AI Use Disclosure

Per hackathon rules: AI tools (Zed + GLM coding assistant) were used as **assistants** for
scaffolding and code generation. All analysis design, data interpretation, and submitted work
are reviewed and owned by the team, as required by the competition's disclosure rules.
