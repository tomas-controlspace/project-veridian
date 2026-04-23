# Málaga Province — Data Sources & Methodology

This folder stages raw source data and the per-municipio master table for
Málaga province (Andalucía, Spain), the second geography in Project
Veridian. It mirrors the Euskadi pipeline in `data/es/` but uses
**nationwide** Spanish sources in place of the Basque-government-only
data that Euskadi relied on (EUSTAT, ECVI, EMAL).

- **Scope**: Málaga province, INE provincia code `29`, 103 municipios.
- **LAU level**: municipio (same as Euskadi).
- **Join key**: 5-digit INE municipality code (`29001`–`29902`).

Nothing in this folder is consumed by the app directly. The build step
(`scripts/prepare-data.js`, not yet extended to multi-province) will
read from here and produce `public/data/` artifacts.

## Directory layout

```
data/es/malaga/
  raw/                                  # pristine downloads (PX, XLS, CSV, GeoJSON)
  master_municipios_malaga.json         # per-municipio join, schema mirrors data/es/master_municipios.json
  boundaries_municipios_malaga.geojson  # filtered from Eurostat GISCO LAU 2024
  facilities/
    malaga_facilities.json              # 99 sites, Google-Places-sourced inventory
  README.md                             # this file
```

---

## Phase 1 — Methodology mapping (Euskadi → Málaga)

Each row below documents the exact Euskadi source that a metric was
extracted from, the proposed Málaga-nationwide substitute, and any
comparability limitations. "Field" names use the master-JSON keys so
they cross-reference `data/es/master_municipios.json`.

### Identity / geography

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `ine_code`, `name`, `provincia_code`, `provincia_name` | INE Padrón API (tables 2854 / 2873 / 2905) via `fetch_demographics.js` | INE Padrón API, table for province 29 Málaga | Identical source — INE Padrón is nationwide. |
| `area_km2` | Eurostat GISCO LAU 2024 EPSG:4326 (`LAU_RG_01M_2024_4326.geojson`), `AREA_KM2` property, joined via `GISCO_ID = "ES_" + ine_code` | Same Eurostat file (already present at `data/es/raw/` for Euskadi — reuse) or `public/data/isochrones_20/LAU_RG_01M_2024_3035.geojson` reprojected to EPSG:4326 | Identical source. GISCO ID format documented in `filter_basque.js:26`. |

### Population

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `pop_2025`, `pop_2024`, `pop_2020`, `pop_2015` | INE Padrón API, `nult=10` last 10 years, series filtered to `Sexo=Total` | Same — INE Padrón is nationwide | Identical. |
| `pop_growth_5yr_pct` | `(pop_2025 - pop_2020) / pop_2020 × 100` | Same formula | Identical. |
| `pop_growth_10yr_pct` | `(pop_2025 - pop_2015) / pop_2015 × 100` (falls back to 2016 if 2015 missing) | Same formula | Identical. |
| `density_per_km2` | `pop_2025 / area_km2`, rounded 1 dp | Same formula | Identical. |

### Age structure

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `pct_young_0_19`, `pct_working_20_64`, `pct_senior_65_plus` | **EUSTAT PX `population_age_groups.px`**, dimension `grandes grupos de edad cumplida`, values `0 - 19` / `20 - 64` / `>= 65`, sex=Total, period 2025-01-01 | **INE Padrón continuo**, table "Población por sexo, edad (grupos quinquenales) y municipios" (INEbase tables per provincia) — aggregate 0-19, 20-64, 65+ from 5-year bands | Different packaging but same underlying Padrón register; EUSTAT republishes INE Padrón with Basque-specific tooling. Values should match INE Padrón nationwide series for the same reference date. |

### Income

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `avg_total_income` | **EUSTAT PX `income_personal_mean.px`**, dimension `tipo de renta` = **"Renta total"**, sex=Total, period 2023 — i.e. **per-person gross total income** from the Basque-government "Renta personal y familiar" statistic (sourced from Haciendas Forales fiscal microdata) | **INE ADRH ("Atlas de Distribución de Renta de los Hogares")** — `Renta bruta media por persona`, latest year available | ⚠ **Comparability caveat**: EUSTAT "Renta personal" uses Basque foral tax data; INE ADRH uses AEAT (state tax agency) data. Both are register-based, per-person, mean gross income, but tax regimes differ. Values should be broadly comparable but a 1–3 % methodological gap is expected. See "Known limitations" below. |
| `avg_available_income` | Same PX file, `tipo de renta` = **"Renta disponible"** (per-person net disposable income, 2023) | INE ADRH — `Renta neta media por persona` | Same caveat as above. "Renta neta" = gross minus taxes and social contributions; matches EUSTAT's "Renta disponible" concept. |

### Housing tenure

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `total_dwellings`, `pct_rented`, `pct_owned` | **EUSTAT PX `housing_tenure.px`**, dimension `régimen de tenencia` (Total, En propiedad, En alquiler, En otras formas), latest period **2021** | **INE Censo de Población y Viviendas 2021** — table "Viviendas principales según régimen de tenencia" (INEbase, national census tables) | EUSTAT 2021 is a Basque republication of INE Census 2021 microdata. Direct equivalent — values should match to the row. |

### Dwelling type (apartment vs house)

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `pct_apartment`, `pct_house`, `total_family_dwellings` | **EUSTAT PX `housing_building_size.px`** — **proxy method**: dimension `número de viviendas en el edificio`, buildings with 1 or 2 dwellings counted as houses, 3+ counted as apartments. `No consta` excluded from denominator. Latest period 2021. | **INE Censo 2021** — table "Viviendas principales según número de viviendas familiares del edificio". Use identical buckets (1 dwelling, 2 dwellings, 3+). | ⚠ Note: Euskadi uses this as a proxy rather than the canonical INE "Tipo de edificio" (unifamiliar vs. colectivo) field because EUSTAT re-publishes the same 2021 Census tables. The proxy is directly replicable nationwide from INE's own tables — so values will be methodologically identical. |

### Housing surface area

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `avg_surface_m2` | **EUSTAT PX `housing_structural.px`**, dimension `características`, value **"Superficie útil media"**, latest period 2021 — i.e. **average useful floor area (m²)** of main-residence dwellings | **INE Censo 2021** — "Viviendas principales por superficie útil media" or equivalent table | Same underlying 2021 Census data. Both use "superficie útil" (useful area, not constructed). |

### Purchase price (€/m²)

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `avg_price_sqm`, `price_source` | **Basque Gov ECVI (Encuesta Cuatrimestral de Vivienda) `ECVI_es_2025T4.xlsx`**. Two sheets used: **T1.3** (€/m² by province + capital + rest-of-province, 2025 Q4) and **T3.3** (€/m² for 7 specific larger municipios). Assignment hierarchy: specific muni → capital → rest-of-province (see `refine_prices.js`). Unit: **€/m² útil** (useful area) per ECVI methodology. Tenure: **all dwellings** (new + secondhand combined). | **MIVAU Valor Tasado de la Vivienda Libre** (Ministerio de Vivienda y Agenda Urbana) — nationwide panel of appraiser valuations, published quarterly, €/m² at municipal level but **only for municipios > 25,000 hab**. Unit: **€/m² constructed** (superficie construida, the MIVAU convention). | **Decision (2026-04-23)**: use MIVAU Valor Tasado €/m² constructed for ALL regions (Málaga + Euskadi). Euskadi migration to MIVAU is a pending follow-up in a separate branch; until then, cross-province price comparisons in the app are **not valid**. `price_source` for Málaga: `municipal` (muni-level MIVAU value available) or `provincial_fallback` (< 25,000 hab muni, uses province-level MIVAU). |

### Residential rent (€/m²/month)

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `avg_rent_sqm` | **Basque Gov EMAL (Estadística Municipal de Alquileres) residential**, sheet **T2.3** — annual, 2024, **new contracts**. Assignment: provincial average × (municipal-size-band multiplier / Euskadi average), producing a size-adjusted pseudo-municipal estimate (`parse_rent_residential.js:53-75`). Unit: **€/m²/month**. | **null for Málaga** (no nationwide municipal-level new-contract source identified). If Phase 2e turns up a usable MIVAU new-contract table, populate; otherwise leave null. | **Decision (2026-04-23)**: leave `avg_rent_sqm` null for Málaga rather than substitute a different-concept value. Cross-province new-contract comparisons are therefore unavailable; use `avg_rent_sqm_active` as the primary rent metric for Málaga in the app. |
| `avg_rent_sqm_active` | **EMAL sheet A2.3**, active contracts June 2025, provincial level only | **MIVAU SERPAVI (Sistema Estatal de Referencia de Precios del Alquiler de Vivienda)** — nationwide, municipal and sección-censal granularity, **€/m²/month**. Based on IRPF tax declarations (fiscal register of rental income, active-contract stock). | **Decision (2026-04-23)**: use SERPAVI for Málaga, store into `avg_rent_sqm_active`. Clean conceptual match with Euskadi's EMAL A2.3 — both measure active-contract stock. Granularity advantage: SERPAVI is municipal-level (Euskadi A2.3 is provincial-only), so Málaga's active rent will be more granular than Euskadi's. Flag in app UI. |

### Housing transaction turnover

| Metric | Euskadi source | Málaga source | Comparability notes |
|---|---|---|---|
| `housing_turnover`, `housing_turnover_year` | **Ministerio de Vivienda "Transacciones inmobiliarias de viviendas por municipios"** (`housing_turnover_municipios.xls`), annual sum of 4 quarters, 2025 preferred (fall back to 2024) | **Same source, same file** — nationwide, municipal-level. Filter rows to Málaga section. | ✅ Identical source. No comparability issues. |
| `housing_turnover_annual_prov` | ECVI T1.1 provincial transaction count, annualized (quarterly × 4) | Same MIVAU file aggregated to provincial level | Minor methodology note: Euskadi's `_annual_prov` came from ECVI; Málaga's equivalent would come from MIVAU provincial totals. Both count the same underlying notary-registered sales. |

### Supply / opportunity fields (computed downstream)

These fields are NOT in `master_municipios.json`; they are computed by
`scripts/prepare-data.js` at build time and written to
`public/data/metrics_municipios.json`. Out of scope for this folder:

- `facility_count`, `ss_facility_count`, `nla_sqm`, `constructed_area_sqm`, `nla_per_capita`, `nla_per_1000_households`, `operator_count`
- `opportunity_score` (0-100 composite, rank-normalized — needs all 6 inputs present)
- `catch_*` / `catch20_*` catchment fields (depend on isochrones, not yet generated for Málaga)

NLA fields in `malaga_facilities.json` are currently null and will be
populated by manual operator research as a separate pass.

---

## Methodology decisions (2026-04-23, resolved by user)

The Phase 1 mapping surfaced three methodological questions. Decisions:

1. **Purchase price — unit + concept**: ALL regions (Málaga and
   Euskadi) must use **MIVAU Valor Tasado de la Vivienda Libre**,
   **€/m² constructed**, to guarantee cross-province comparability.
   - **Málaga** (this branch): fetch MIVAU Valor Tasado directly; no
     conversion factor applied.
   - **Euskadi** (⚠ **pending follow-up in a separate branch/session**):
     the current `avg_price_sqm` values in `data/es/master_municipios.json`
     come from Basque Gov ECVI (€/m² útil, transaction prices) and are
     **not** comparable to Málaga. A migration pass must re-source
     Euskadi from MIVAU Valor Tasado as well. Until that happens, the
     app will be showing Málaga MIVAU values side-by-side with Euskadi
     ECVI values — document this clearly in the app's UI tooltip or
     defer Málaga's public release until Euskadi is migrated.

2. **Rent concept**: Use **MIVAU SERPAVI** for Málaga, store into
   `avg_rent_sqm_active` (active-contract stock), leave `avg_rent_sqm`
   (new contracts) **null** unless Phase 2e identifies a nationwide
   municipal-level new-contract source.
   - Euskadi already has `avg_rent_sqm_active` populated from EMAL A2.3
     (provincial-level); this is the comparable Euskadi field.
   - For cleaner cross-province comparison, the app should prefer
     `avg_rent_sqm_active` over `avg_rent_sqm` when rendering Málaga.
     That is a downstream UI change, not a Phase 1-4 concern here.

## Remaining known limitations (not blocking)

- **Price coverage gap**: MIVAU Valor Tasado publishes municipal values
  only for municipios **> 25,000 hab**. In Málaga ~15 of 103 municipios
  clear that threshold; the other ~88 will receive a **provincial
  fallback** (province-level €/m² constructed). Document exact coverage
  once pulled (Phase 2f).
- **Age-group aggregation**: INE Padrón publishes 5-year bands; aggregate
  0-19, 20-64, 65+ mechanically. No methodology issue.
- **Registradores granularity**: not yet investigated (Phase 2g). Will
  STOP and report before committing that source.

Additional limitations that will surface only after Phase 2:

- **Price coverage gap**: MIVAU Valor Tasado only publishes for
  municipios > 25,000 hab. In Málaga ~15 of 103 municipios clear that
  threshold; the other ~88 will need a provincial fallback. Will
  document exact coverage when data is pulled.
- **Age groups from INE Padrón**: INE publishes 5-year age bands; need
  to aggregate 0-4, 5-9, 10-14, 15-19 → 0-19 etc. Mechanical, no
  methodology concerns.
- **Registradores**: granularity not yet investigated (Phase 2g).
  Instructions say STOP and report before committing.

---

## Per-source provenance (populated in Phase 2)

_(URLs, download dates, file versions, row counts, and coverage notes
will be added as each source is fetched.)_

### Facilities

| Field | Value |
|---|---|
| File | `facilities/malaga_facilities.json` |
| Records | 99 facilities across 17 municipios |
| Collection date | 2026-04-23 |
| Source | Google Places (`places_search` tool), multi-query keyword search across Málaga sub-regions |
| NLA | `nla_m2: null` for all records — manual research pending |
| Schema | matches `data/es/facilities/basque_facilities.json` shape (`id`, `name`, `brand`, `municipio`, `postal_code`, `address`, `lat`, `lng`, `place_id`, `phone`, `website`, `rating`, `rating_count`, `nla_m2`, `source`) |

### INE Padrón (population + age) — Phase 2a, downloaded 2026-04-23

| Field | Value |
|---|---|
| Fetch script | `fetch_padron.js` (re-runnable) |
| **Population** file | `raw/ine_padron_2882_malaga.json` (raw WSTEMPUS API response) |
| Population source | INE table **2882** (operation 22 "Cifras Oficiales de Población de los Municipios Españoles: Revisión del Padrón Municipal"), https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/2882?tip=AM&nult=10 |
| Population vintage | annual, 2016–2025 (latest = 1 de enero de 2025) |
| Population coverage | 103 / 103 Málaga munis. QA: provincial total 2025 = **1,791,092** (matches INE published figure) |
| **Age structure** file | `raw/ine_padron_continuo_33570_malaga.px` (filtered subset of nationwide PX, 523 KB) |
| Age source | INE table **33570** (operation 188 "Estadística del Padrón Continuo" — "Población por sexo, municipios y edad, grupos quinquenales"), https://www.ine.es/jaxiT3/files/t/es/px/33570.px (50 MB original, filtered in-process to 103 Málaga munis + "Total Nacional") |
| Age vintage | **1 de enero de 2022** (latest available in this table) |
| Age bands used | 0-4, 5-9, 10-14, 15-19 → `pct_young_0_19`; 20-24 … 60-64 → `pct_working_20_64`; 65-69 … 95-99 + "100 y más" → `pct_senior_65_plus` |
| Age coverage | 103 / 103 Málaga munis; percentages sum to 100 (± 0.2 pp) for all munis |
| **Output** | `demographics_malaga.json` (population by year + growth + age %) |
| **Cross-source QA** | `pop_2022` from WSTEMPUS (Cifras Oficiales) matches `pop_2022_padron_continuo` from PX 33570 exactly for all 103 munis |
| ⚠ **Vintage gap vs Euskadi** | Euskadi's age data (EUSTAT `population_age_groups.px`) is reference date **2025-01-01**; Málaga's is **2022-01-01** — a 3-year gap. Age structure is slow-moving (typical year-over-year delta < 0.3 pp per bucket) so this is a documented limitation, not a blocker. Population itself is fully current (2025). |
| Bug caught during fetch | Initial muni-filter regex missed codes starting with `291*` (specifically 29100 Yunquera); fixed to use `^29\d{3}\s` pattern. Final output has all 103 munis. |
