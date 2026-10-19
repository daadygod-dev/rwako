# Methodology — Rwanda Compass

## 1. Problem framing
Rwanda's NST2 and Vision 2050 set measurable targets across wellbeing, health, education,
infrastructure, and inclusion — but delivery happens through 30 districts with unequal starting
points and budgets. The core question we answer:

> "Given a budget envelope, which districts and indicators should be prioritized first,
> and why — using transparent, data-driven evidence?"

## 2. Data model
- **Unit of analysis:** district (ADM2, 30 units).
- **Inputs:** wide CSV — `district, province, <indicator columns>` — dropped into `data/raw/`.
  Official NISR outputs (District Statbooks, EICV, DHS, Census) are the intended sources
  (CC BY 4.0). A synthetic demo file keeps the app runnable pre-submission and is banner-flagged.
- **Boundaries:** GeoBoundaries RWA ADM2 (CC BY 4.0), fetched once and cached.

## 3. Deprivation gaps
Each indicator is min–max normalized into a gap in [0, 1], 1 = most deprived district:

    high-is-bad:  gap = (x - min) / (max - min)
    low-is-bad:   gap = (max - x) / (max - min)

Relative (not absolute) scoring is deliberate: it surfaces *comparative* need for allocation
decisions. Absolute thresholds per NST2 target can be layered in later.

## 4. Need score
Weighted mean of gap scores:

    NS_d = Σ_i w_i · gap_{d,i} / Σ_i w_i

Weights are user-configurable (0–5), so the tool adapts to the decision-maker's mandate
(e.g. a health SWAp weights stunting and insurance higher) while remaining fully transparent —
the rubric's "data use & methodology" criterion rewards defensible, explainable methods.

## 5. ML components
1. **District typologies** — K-Means (k selectable) on standardized gaps + PCA projection.
   Clusters surface *patterns* of deprivation (e.g. "remote agrarian, low electrification" vs
   "urbanizing, low food security"), which justify different intervention packages.
   Cluster quality is reported as a silhouette score alongside every result.
2. **Driver analysis** — Gradient Boosting Regressor with one indicator held out as target and
   the rest as features; feature importances explain *which co-deprivations travel with the
   outcome* (e.g. what tracks with poverty). The target is excluded from features to prevent leakage.
3. **Counterfactual prediction** — the same gradient-boosting setup, trained in RAW units
   (not gaps), predicts an outcome for one district under planner-edited scenarios
   ("what if electricity access in Nyamagabe reached 80%?"). Honesty machinery:
   leave-one-out cross-validation (R² + MAE reported with every prediction),
   scenario values clipped to observed district ranges (no silent extrapolation),
   minimum 8 complete districts required, deterministic seeds.

## 6. Allocation simulator
Greedy proportional allocation: each district's share of the budget equals its share of the
Need score (optionally floored so no district gets zero). Optional **population weighting**:
when the dataset includes a `population` column, shares are additionally proportional to residents
at equal need — the displayed Need score is never re-scaled. This is a defensible
first-pass allocation rule; optimizing against cost curves per intervention is future work
(needs intervention-level cost data).

## 7. Validation & quality
- Ingestion validates required columns, numeric integrity, and deduplicates districts.
- Coverage gating (≥90% + variance) decides which indicators enter any computation.
- A smoke test runs the full pipeline: ingest → gaps → index → cluster → drivers → allocation.
- Predictions additionally report leave-one-out R²/MAE; the 48-test backend suite
  pins determinism, leakage guards, and empty-data behavior.
- Known limitations: min–max gaps are sensitive to outliers; relative ranking changes when the
  roster of districts changes; counterfactuals are observational (companions, not causes);
  no population weights yet (planned: add `population` column and
  weight allocations by per-capita gap).

## 8. AI-use disclosure (as required by the hackathon)
AI tools were used as coding assistants for scaffolding and boilerplate. All methodology choices,
data sourcing, interpretation, and final submissions are the team's own reviewed work.
