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
  raw/                                  # pristine / filtered-to-Málaga source files
    ine_padron_2882_malaga.json           Phase 2a — pop by year
    ine_padron_continuo_33570_malaga.px   Phase 2a — age quinquenal subset
    ine_adrh_31106_malaga.px              Phase 2d — income
    ine_censo_viviendas_2021_malaga_rows.tsv   Phase 2c — 99k microdata rows
    ine_censo_viviendas_2021_malaga_sample.json Phase 2c — sample aggregates
    mivau_serpavi_2024_malaga.json        Phase 2e — rent subset
    mivau_valor_tasado_tabla1_35101000.xls Phase 2f — provincial prices
    mivau_valor_tasado_tabla5_35103500.xls Phase 2f — muni-level prices
    mivau_transacciones_malaga.json       Phase 2h — transactions subset
  demographics_malaga.json              Phase 2a intermediate
  boundaries_municipios_malaga.geojson  Phase 2b — filtered from Eurostat GISCO LAU 2024
  housing_malaga.json                   Phase 2c intermediate
  income_malaga.json                    Phase 2d intermediate
  rent_malaga.json                      Phase 2e intermediate
  prices_malaga.json                    Phase 2f intermediate
  turnover_malaga.json                  Phase 2h intermediate
  master_municipios_malaga.json         Phase 3 — final join, 103 munis, schema mirrors data/es/master_municipios.json
  facilities/
    malaga_facilities.json              99 sites, Google-Places-sourced inventory
  fetch_padron.js                       Phase 2a
  filter_boundaries.js                  Phase 2b
  process_censo_microdata.js            Phase 2c
  fetch_income.js                       Phase 2d
  process_serpavi.js                    Phase 2e
  process_valor_tasado.js               Phase 2f
  process_transacciones.js              Phase 2h
  build_master_malaga.js                Phase 3 — joins all intermediates
  README.md                             this file
```

All scripts are re-runnable. Large upstream files (INE Censo 2021 Viviendas
microdata 136 MB zip, MIVAU SERPAVI 68 MB xlsx, INE Padrón PX 50 MB) are
NOT committed — they're cached in `%TEMP%\ine_scratch\` and re-downloaded
if missing.

## Final master record shape (Málaga)

`master_municipios_malaga.json` has 103 records, each with 33 fields.
Fields new vs Euskadi (introduced by the 2026-04-23 methodology
decisions) are marked ★:

```
ine_code, name, provincia_code, provincia_name, area_km2,
pop_2025, pop_2024, pop_growth_5yr_pct, density_per_km2,
pct_young_0_19, pct_working_20_64, pct_senior_65_plus,
avg_total_income, avg_available_income,
total_dwellings, pct_rented, pct_owned,
pct_apartment, pct_house, total_family_dwellings, avg_surface_m2,
housing_source ★,
avg_price_sqm, price_source, price_unit ★,
avg_rent_sqm (always null in Málaga), avg_rent_sqm_active, rent_source ★,
housing_turnover, housing_turnover_year, housing_turnover_annual_prov,
nla_sqm (null, manual), nla_per_capita (null, manual)
```

## Quick-reference vintage per field

| Field | Source | Vintage |
|---|---|---|
| `pop_{year}`, `pop_growth_*` | INE Padrón (Cifras Oficiales), op 22 table 2882 | 2016 – **2025** annual |
| `pct_young/working/senior` | INE Padrón Continuo, op 188 table 33570 | **2022-01-01** (latest INE publishes at muni level) |
| `avg_total_income`, `avg_available_income` | INE ADRH, table 31106 | **2023** |
| Housing (tenure, dwelling type, surface, totals) | INE Censo 2021 Viviendas microdata, 10 % sample | **2021-11-01** |
| `avg_price_sqm` | MIVAU Valor Tasado, Tabla 1 + Tabla 5 | **Q4 2025** |
| `avg_rent_sqm_active` | MIVAU SERPAVI (fiscal IRPF data) | **2024** |
| `housing_turnover` | Mitma Transacciones Inmobiliarias | annual 2025 (provisional), fallback 2024 |

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

3. **Housing (tenure / dwelling type / surface / total dwellings) —
   use INE Censo 2021 microdata for ALL regions** (Option A). Chosen
   after Phase 2c investigation — full write-up below.

### 3a. Housing data source — Option A decision detail

**Context**: Euskadi stores `pct_rented`, `pct_owned`, `pct_apartment`,
`pct_house`, `total_dwellings`, `total_family_dwellings`, `avg_surface_m2`
in `data/es/master_municipios.json`. All seven fields come from EUSTAT
PX files (`housing_tenure.px`, `housing_building_size.px`,
`housing_structural.px`) — which is the **Basque Government's own
re-aggregation of INE Censo 2021 microdata at full 100 % coverage for
all 252 Basque munis**. Non-Basque regions do not have an equivalent
republication; public INE Censo 2021 pre-defined tables stop at munis
> 50,000 hab for tenure/surface, and publish no building-type table at
municipal level at all. INE does publish a **10 % microdata sample** of
the 2021 Viviendas census, but the `CMUN` field is recoded to three
size bins (`991` ≤ 2k hab, `992` 2k-5k, `993` 5k-10k) for munis under
10,000 hab to protect statistical secrecy — so 80 % of Spanish munis
lose their identity in the public microdata.

**Options considered** (2026-04-23, full notes in conversation log):

| # | Option | Pros | Cons |
|---|---|---|---|
| A | Hybrid Censo 2021 microdata (muni-level for >10k hab, size-bin for <10k), applied to ALL regions including Euskadi | Scales to all Spain; same source everywhere; public + free; population coverage >85 % nationally | Euskadi loses some muni-level granularity vs current EUSTAT data for small munis |
| B | Option A for Málaga only, keep Euskadi on EUSTAT | Ships Málaga fastest with no Euskadi regression | Permanent methodological inconsistency that worsens with every new region added |
| C | INE Censo 2011 (has full muni coverage for all Spain) | 100 % muni coverage nationwide | 14-year vintage — Costa del Sol / Basque Country have both shifted materially since 2011 |
| D | Hybrid Censo 2021 (big munis) + Censo 2011 (small munis) | Full coverage | Mixed vintages within one dataset — misleading on the choropleth |
| E | Null fields for <10k hab munis | Simplest | Breaks opportunity scoring for 84 of 103 Málaga munis |

**User decision (2026-04-23)**: **Option A**.

### 3b. State of the data BEFORE this decision (how to reverse)

To revert to the pre-decision state, you need to understand what each
region's housing data looked like up to this point.

**Euskadi (`data/es/master_municipios.json`)** — as it stands on branch
`main` and still stands on this branch (not yet migrated):

- All 252 Basque munis have non-null `pct_rented`, `pct_owned`,
  `pct_apartment`, `pct_house`, `avg_surface_m2`, `total_dwellings`,
  `total_family_dwellings`.
- Source per field:
  - `pct_rented`, `pct_owned`, `total_dwellings`: EUSTAT PX
    `data/es/raw/housing_tenure.px`, dim `régimen de tenencia`
    (Total / En propiedad / En alquiler / En otras formas), period
    2021. Parsed by `data/es/build_master.js`.
  - `pct_apartment`, `pct_house`, `total_family_dwellings`: EUSTAT PX
    `data/es/raw/housing_building_size.px`, PROXY method — buildings
    with 1-2 dwellings counted as houses, 3+ as apartments, `No
    consta` excluded from denominator. Period 2021. Parsed by
    `data/es/parse_housing_final.js`.
  - `avg_surface_m2`: EUSTAT PX `data/es/raw/housing_structural.px`,
    dim `características`, value `Superficie útil media`, period 2021.
    Parsed by `data/es/parse_housing_final.js`.
- Reference date: 2021-01-01 per EUSTAT labeling (effectively Censo
  2021's 2021-11-01 snapshot, repackaged).
- Sampling: 100 % (EUSTAT has full access to INE Censo 2021
  microdata by inter-agency arrangement).

**Málaga (this branch, pre-Option-A)** — if we rolled Option A back:

- Option E's null state for <10k hab munis would be the closest to "do
  nothing". Only the 19 munis >10k hab would have housing data, from
  `tpx=59529` (tenure) + `tpx=59528`/`59530` (surface), directly via
  jaxi URL. No apartment/house proxy available anywhere nationally.
- Reference date: 2021-11-01 (Censo 2021).
- Fields set: `pct_rented`, `pct_owned`, `avg_surface_m2`,
  `total_dwellings` for 19 munis; the other four fields (including
  `pct_apartment`/`pct_house`) unavailable.

### 3c. Differences between Euskadi and Málaga under Option A

Implementation is identical in shape but arithmetic differs by muni
size. After the Euskadi migration, both regions share a new
`housing_source` field on each muni record — one of:

- `muni_microdata` — CMUN identifies the specific muni (munis > 10k
  hab). Per-muni sample sizes from INE's 10 % sample range roughly
  500 – 22,000 principal dwellings. Percentages at ±2-3 pp confidence
  for the smallest; rock-solid for the largest.
- `provincial_bin_le2k` / `provincial_bin_2k_5k` / `provincial_bin_5k_10k`
  — CMUN was recoded to one of `991`/`992`/`993`; only the bin-level
  aggregate is available. All munis in the same province + size bin
  share identical `pct_*` and `avg_surface_m2` values. This applies to
  munis under 10k hab. Current Málaga extraction: **3 size-bin records
  per province** (one per bin, computed from Málaga-province rows of
  each bin).

After migration, Euskadi's per-muni granularity for small munis is
**degraded** relative to current state — specifically:

| Region | Current small-muni (<10k) source | Post-Option-A source |
|---|---|---|
| Euskadi | EUSTAT full-population aggregates (each muni distinct) | INE 10 %-sample size-bin (all same-band munis share one value) |
| Málaga | N/A — no data today | INE 10 %-sample size-bin (same treatment as Euskadi) |

This means ~200 small Euskadi munis lose individual tenure/apartment
percentages after migration. They will instead inherit their
province's size-bin aggregate.

### 3d. Implementation in this branch (Málaga side only)

- `fetch_padron.js` (Phase 2a) unchanged — population/age unaffected.
- `process_censo_microdata.js` (Phase 2c) downloads the INE Censo 2021
  Viviendas microdata zip from
  https://www.ine.es/ftp/microdatos/censopv/cen21/CensoViviendas_2021.zip
  (95 MB TSV, 2.66M records, 10 % sample, ref date 2021-11-01),
  filters rows to `CPRO='29'`, writes three files:
  - `raw/ine_censo_viviendas_2021_malaga_rows.tsv` (3.4 MB — all 99,653
    Málaga microdata rows, for audit)
  - `raw/ine_censo_viviendas_2021_malaga_sample.json` (intermediate
    sample counts per muni/bin, ~9 KB)
  - `housing_malaga.json` (processed per-muni/bin record with pct_*
    and avg_surface_m2 — what Phase 3 will consume)
- The 95 MB master microdata TSV is NOT committed. It is cached in
  `%TEMP%\ine_scratch\censo2021\` and the fetch script is
  re-runnable.

### 3e. Implementation pending (Euskadi migration, separate branch/session)

The Euskadi migration pass must:

1. Download the same INE Censo 2021 Viviendas microdata zip.
2. Filter rows to `CPRO` in `{'01','20','48'}`.
3. For each of the 252 Euskadi munis, assign values by the same
   muni-microdata / size-bin rule as Málaga.
4. Overwrite `pct_rented`, `pct_owned`, `pct_apartment`, `pct_house`,
   `avg_surface_m2`, `total_dwellings`, `total_family_dwellings` in
   `data/es/master_municipios.json`.
5. Add a new `housing_source` field per muni record.
6. Re-run `scripts/prepare-data.js` — opportunity scoring inputs
   (apartment %, rented %) will be size-bin averages for small munis
   rather than per-muni, which may shift scores for rural munis.

Impact on Euskadi:
- ~45 munis > 10k hab keep full muni-level resolution.
- ~207 munis < 10k hab get bin-level values — all munis in the same
  (province × size bin) share one value.

### 3f. Reversing Option A

If the user later decides Option A was wrong:

- **Reverting Málaga alone**: delete `data/es/malaga/housing_malaga.json`
  and `data/es/malaga/raw/ine_censo_*`. Switch Phase 3 Málaga build to
  either Option B (tpx=59529 + provincial fallback) or Option E (null
  for <10k munis). The microdata extraction is orthogonal to other
  phases — reversal doesn't touch population, boundaries, income,
  prices, rents, or turnover.
- **Preventing Euskadi migration**: before the Euskadi migration
  branch runs, reconsider and take Option B instead. Euskadi stays on
  EUSTAT; Málaga keeps this folder's hybrid; cross-province
  comparability of housing fields becomes documented-inconsistent.
- **After Euskadi has been migrated**: restoring the pre-migration
  EUSTAT values requires re-running the original `build_master.js` →
  `parse_housing_final.js` chain against `data/es/raw/housing_*.px`
  (those files are already committed, so full recovery is possible).

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

### Eurostat GISCO LAU 2024 boundaries — Phase 2b, processed 2026-04-23

| Field | Value |
|---|---|
| Filter script | `filter_boundaries.js` (re-runnable) |
| Input | `../raw/LAU_RG_01M_2024_4326.geojson` (143 MB, pre-existing in-repo file from Euskadi Phase; EPSG:4326 WGS84) |
| Upstream source | Eurostat GISCO, https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/local-administrative-units (2024 release) |
| Filter | `CNTR_CODE === 'ES'` AND `GISCO_ID` local code starts with `29` (Málaga province) |
| Output | `boundaries_municipios_malaga.geojson` (130 KB, 103 features) |
| Properties kept | `ine_code`, `name` (LAU_NAME), `provincia_code="29"`, `provincia_name="Málaga"`, `pop_2024` (see note), `pop_dens_2024` (see note), `area_km2` |
| Reprojection | None needed — source is already EPSG:4326. |
| QA | 103 features (= INE muni count). Province area sum = **7,308.4 km²** (matches published Málaga province total ~7,308 km²). |
| ⚠ Note on `pop_2024` / `pop_dens_2024` | These properties are **0 for all Spanish munis** in this particular GISCO file (not Málaga-specific — Bilbao 48020 is also 0). Use `demographics_malaga.json` for population, this file only for geometry + `area_km2`. |

### INE Censo 2021 Viviendas microdata — Phase 2c, processed 2026-04-23

| Field | Value |
|---|---|
| Processing script | `process_censo_microdata.js` (streaming TSV reader, filters CPRO=29) |
| Upstream source | INE Censo de Población y Viviendas 2021, Viviendas microdata, https://www.ine.es/ftp/microdatos/censopv/cen21/CensoViviendas_2021.zip (135.8 MB zip, contains 95 MB TSV) |
| Record design | https://www.ine.es/ftp/microdatos/censopv/cen21/dr_CensoViviendas_2021.zip (consulted via xlsx package) |
| Reference date | 2021-11-01 |
| Sample | 10 % of Spanish family dwellings (INE-declared; ORDEN_V ranges 1 to 2,662,371) |
| Recoding rule | For munis < 10,000 hab, INE replaces the 3-digit `CMUN` code with size-bin `991` (≤2k hab), `992` (2k-5k) or `993` (5k-10k). Munis > 10k hab keep their real 3-digit code. |
| Raw output | `raw/ine_censo_viviendas_2021_malaga_rows.tsv` (3.4 MB, 99,653 rows — all Málaga dwellings from the 10 % sample) |
| Intermediate | `raw/ine_censo_viviendas_2021_malaga_sample.json` (~9 KB — sample counts per muni/bin for tenure × dwelling type × surface aggregation) |
| Processed output | `housing_malaga.json` — 22 records = 19 real munis > 10k hab + 3 size bins covering the other 84 munis |
| Cached master microdata | NOT committed (95 MB). Cached in `%TEMP%\ine_scratch\censo2021\`. Script re-downloads if missing. |
| **Coverage** | **19 / 103** munis get muni-level data (88.6 % of province population). **84 / 103** munis inherit one of 3 size-bin aggregates (11.4 % of pop, mostly rural interior). |
| Smallest muni-level sample | Álora 29012 — 518 principal dwellings (≈ ±3 pp 95 % CI on percentages) |
| Largest muni-level sample | Málaga city 29067 — 21,796 principal dwellings |
| Aggregation method | Mirrors `../parse_housing_final.js`: TIPO_EDIF 1-2=house, 3=apartment, 4=excluded; TENEN_VIV 2=propiedad, 3=alquiler, 4=otro; SUPERF mean over principal dwellings ('.' excluded). Percentages computed from raw sample counts (ratios are sample-size invariant up to sampling error). |
| QA — Málaga city spot-check | `pct_rented`=13.3 %, `pct_owned`=79.8 %, `pct_apartment`=85.6 %, `avg_surface_m2`=83.4 m² — all within expected ranges for a dense southern Spanish capital. |
| Size-bin spot-check | ≤2k hab band: `pct_apartment`=8.7 %, `avg_surface_m2`=106.6 m² — consistent with rural Serranía de Ronda housing profile. |
| Decision context | See **Methodology decisions §3 (Option A)** above. |

### INE ADRH income — Phase 2d, downloaded 2026-04-23

| Field | Value |
|---|---|
| Fetch script | `fetch_income.js` (re-runnable) |
| Upstream source | INE Atlas de Distribución de Renta de los Hogares (ADRH), operation 353 `ADRH`, table **31106** "Indicadores de renta media y mediana" (Málaga province), https://www.ine.es/jaxiT3/files/t/es/px/31106.px |
| Raw | `raw/ine_adrh_31106_malaga.px` (624 KB) |
| Reference year | **2023** (latest in the 9-year series 2015-2023) |
| Processed output | `income_malaga.json` — 103 records, all munis covered |
| Fields extracted (4 indicators × 2023) | `avg_total_income` = Renta bruta media por persona; `avg_available_income` = Renta neta media por persona; `avg_total_income_hogar` = Renta bruta media por hogar; `avg_available_income_hogar` = Renta neta media por hogar |
| Filter | Keep only 5-digit muni codes; discard the 1,257 distrito/sección rows also present in the PX |
| Coverage | 103 / 103 Málaga munis ✓ |
| QA spot-check | Málaga city (29067): bruta/persona=€16,761, neta/persona=€13,847, bruta/hogar=€44,348, neta/hogar=€36,640. Range: Benamargosa €9,768 → Benahavís €20,419. |
| ⚠ Methodological note vs Euskadi | Euskadi's `avg_total_income` = EUSTAT "Renta total" per-person (Haciendas Forales data); Málaga's `avg_total_income` = ADRH "Renta bruta media por persona" (AEAT data). Both are register-based, per-person, mean gross income, but tax regime differs. Expect a 1-3 % methodological gap beyond the real income difference between regions. |

### MIVAU SERPAVI rents — Phase 2e, downloaded 2026-04-23

| Field | Value |
|---|---|
| Processing script | `process_serpavi.js` (re-runnable; downloads full nationwide xlsx to scratch if not cached) |
| Upstream source | MIVAU "Sistema Estatal de Referencia del Precio del Alquiler de Vivienda" (SERPAVI), full 2011-2024 panel. https://cdn.mivau.gob.es/portal-web-mivau/vivienda/serpavi/2026-03-09_bd_SERPAVI_2011-2024%20-%20DEFINITIVO%20WEB.xlsx (67.9 MB) |
| Full xlsx location | NOT committed (67.9 MB). Cached in `%TEMP%\ine_scratch\mivau_serpavi_2011_2024.xlsx` — re-downloaded automatically if missing. Will be reused for Euskadi migration + other provinces. |
| Málaga-only subset (committed) | `raw/mivau_serpavi_2024_malaga.json` (381 KB) — all 103 Málaga muni rows from the Municipios sheet + the Málaga row from the Provincias sheet |
| Concept | Active-contract stock rents derived from IRPF tax declarations, €/m²/month |
| Field | Stored into `avg_rent_sqm_active` (matches Euskadi EMAL A2.3 concept — active stock, not new contracts) |
| `avg_rent_sqm` | **null for all Málaga munis** (see Methodology §2 — no nationwide muni-level new-contract source) |
| Reference year | **2024** |
| Primary indicator per muni | `ALQM2_LV_M_VC_24` — median €/m²/mes for viviendas colectivas (apartments) |
| Fallback 1 | `ALQM2_LV_M_VU_24` — median for viviendas unifamiliares (single-family) if VC suppressed |
| Fallback 2 | Málaga provincial median (`ALQM2_LV_M_VC_24` from Provincias sheet = €9.04/m²/mes) if both are suppressed |
| `rent_source` field per record | `serpavi_muni_apt` / `serpavi_muni_singlefam` / `serpavi_prov_fallback` |
| **Coverage** | 41 munis muni-apt + 25 muni-singlefam = **66 / 103** with direct muni-level data. 37 munis use provincial fallback (small rural munis with tax-privacy suppression). No nulls. |
| QA spot-check | Málaga city: €9.55/m² (25,741 tax records). Marbella: €9.63. Mijas: €8.68. Range: Cortes de la Frontera €1.33 → Benahavís €10.77. |
| ⚠ Note vs Euskadi | SERPAVI is 2024 data; Euskadi EMAL A2.3 in `data/es/master_municipios.json` is June 2025 active contracts. 6-month vintage gap. Also: SERPAVI is **median**, EMAL A2.3 publishes both (field stored is mean where available). Impact on comparability: small — median vs mean for rents typically differ by < 5 %. |

### MIVAU Valor Tasado purchase prices — Phase 2f, downloaded 2026-04-23

| Field | Value |
|---|---|
| Processing script | `process_valor_tasado.js` (re-runnable) |
| Upstream source | MIVAU "Estadística de Valor Tasado de la Vivienda", served at https://apps.fomento.gob.es/boletinonline2/?nivel=2&orden=35000000 (legacy Fomento portal still hosts the xls files) |
| Tabla 1 | `raw/mivau_valor_tasado_tabla1_35101000.xls` (240 KB) — Valor tasado medio de vivienda libre: nacional + CCAA + provincias, quarterly series 1995-Q4 2025. Used for Málaga provincial fallback. |
| Tabla 5 | `raw/mivau_valor_tasado_tabla5_35103500.xls` (3.8 MB) — Valor tasado por municipio > 25,000 hab, one sheet per quarter T1A2005–T4A2025. Used for muni-level values. |
| Reference quarter | **T4 2025 (4º trimestre de 2025)** for both tables (the latest sheet in Tabla 5 and the latest column in Tabla 1). Same quarter across both sources. |
| Unit | **€/m² constructed** (per MIVAU methodology — `price_unit: 'eur_per_sqm_constructed'`). Same unit for Málaga as for the pending Euskadi migration. |
| Tenure | "Total" column (all housing vintages combined: new + < 5 years + > 5 years). Per-muni dataset in Tabla 5 also exposes "Hasta 5 años" and "Con más de 5 años" — not stored by this pipeline. |
| Málaga provincial value (fallback) | **€2,897.3/m²** (Q4 2025) applied to the 91 munis < 25k hab |
| **Coverage** | **12 / 103** munis get muni-level value from Tabla 5 (the MIVAU >25k hab roster). **91** munis use provincial fallback. No nulls. |
| `price_source` field values | `municipal` / `provincial_fallback` |
| QA spot-check | Málaga city €3,246.2/m² (n=1,825 tasaciones). Marbella €4,270.2 (highest; affluent Costa del Sol). Antequera €1,409.2 (lowest of the 12 muni-level, interior). |
| Muni-list covered (>25k hab in Tabla 5) | Málaga, Marbella, Mijas, Vélez-Málaga, Fuengirola, Benalmádena, Estepona, Torremolinos, Rincón de la Victoria, Alhaurín de la Torre, Antequera, Ronda |
| Name-matching fallback | Muni names in Tabla 5 use "Vélez Málaga" (space) whereas INE Padrón uses "Vélez-Málaga" (hyphen). Script normalizes both before matching. |
| ⚠ Cross-region caveat | Euskadi's `avg_price_sqm` in `data/es/master_municipios.json` is **not yet migrated** to MIVAU; it's still €/m² útil transaction prices from ECVI. Málaga-vs-Euskadi price comparisons in the app are **not valid** until the Euskadi migration branch ships. See Methodology decision §1. |

### Registradores — Phase 2g, investigated 2026-04-23, **SKIPPED**

Investigated the Colegio de Registradores "Estadística Registral
Inmobiliaria" via its Open Data portal
(https://opendata.registradores.org/dataset/dataset). **Finding**:
published datasets — residential sales, commercial sales, IPVVR price
index — are all at **provincial level only**. No municipal
granularity exists in either the Open Data portal or the quarterly/
annual yearbook PDFs.

**Decision**: skip Phase 2g entirely. Rationale:
- Euskadi has **zero** Registradores-sourced fields in
  `data/es/master_municipios.json` — adding one Málaga-only field
  would create a Málaga-only column with no Euskadi equivalent.
- Provincial €/m² is already in `prices_malaga.json` via MIVAU Valor
  Tasado fallback (Phase 2f).
- Muni-level compraventa counts are covered by MIVAU Transacciones
  (Phase 2h below) — same underlying notary registry data with
  municipal granularity that Registradores' portal does not expose.
- IPVVR repeat-sales index could theoretically add a price-trend
  signal, but there's no app component using it today and no Euskadi
  data to compare against. If needed later, it's a nationwide
  single-fetch that can be added across all regions in one pass.

No commit for Phase 2g.

### MIVAU Transacciones inmobiliarias — Phase 2h, processed 2026-04-23

| Field | Value |
|---|---|
| Processing script | `process_transacciones.js` |
| Upstream source | Ministerio de Vivienda "Número total de transacciones inmobiliarias de viviendas por municipios" — **same file Euskadi already uses**. `data/es/raw/housing_turnover_municipios.xls` (6 MB, committed as part of the Euskadi pipeline — not duplicated into Málaga's `raw/`). |
| Reference period | Annual totals = sum of 4 quarters. Prefers 2025 (provisional) where non-zero, falls back to 2024. Matches Euskadi's rule exactly (`data/es/parse_housing_turnover.js:91-93`). |
| Málaga-only audit dump | `raw/mivau_transacciones_malaga.json` — all 104 Málaga-block rows (header + 103 munis) × 92 columns (2004 Q1 to 2025 Q4) sliced out of the nationwide xls for offline audit. |
| Processed output | `turnover_malaga.json` — 103 records with `housing_turnover`, `housing_turnover_year`, plus both 2024 and 2025 annual totals for reference. |
| Name-matching | Muni names in the MIVAU xls match INE Padrón exactly for Málaga (no NAME_OVERRIDES needed). 103 / 103 matched. |
| QA spot-check | Málaga city 6,299 tx (2025). Marbella 4,407. Estepona 3,475. Mijas 3,197. Fuengirola 2,172. Alameda 85. Yunquera 37. Province total 2025 = **36,164 transactions**. |
| Cross-region QA | Identical source file as Euskadi — no methodology gap. Euskadi migration needs zero work for this field. |

### Isochrones (10-min + 20-min drive-time) — generated 2026-04-23 / 2026-04-24

| Field | Value |
|---|---|
| Generation scripts | `generate_isochrones.js` (10 min, `RANGE_SECONDS = 600`) and `generate_isochrones_20.js` (20 min, `RANGE_SECONDS = 1200`) — Málaga-specific clones of `scripts/generate-isochrones{,-20}.js` with paths re-rooted at `data/es/malaga/` and a single-province merge. |
| API | OpenRouteService v2 `driving-car` isochrones (free tier: 40 req/min, 2,000/day). Requires `ORS_API_KEY` env var. |
| Output layout | `data/es/malaga/isochrones/municipios/{ine_code}.geojson` + `.../provincias/29.geojson` for 10-min; same under `isochrones_20/` for 20-min. Coordinate precision reduced to 5 decimals. |
| Resume behavior | `isochrones/progress.json` tracks per-muni status. Re-running skips `done` entries. |
| **Coverage** | **103 / 103** munis for both 10-min and 20-min. Provincial merges include all 103 munis (unlike Euskadi where 13 munis had no ORS data, Málaga has no isochrone gaps). |
| Bug caught + fixed | Initial 10-min run had 5 munis (29016 Árchez, 29035 Cañete la Real, 29054 Fuengirola, 29079 Periana, 29903 Montecorto) silently drop after 3 consecutive HTTP 429s — the retry-loop exited without marking progress. Resumable re-run filled them in. Both scripts now flag `error` when retries are exhausted so the failure is visible. |
| File size | 872 KB (10-min) + 1.5 MB (20-min) = ~2.4 MB total committed. |

### Málaga NLA manual-research workflow

| Field | Value |
|---|---|
| Template builder | `facilities/build_nla_research_template.py` (Python + openpyxl, re-runnable) |
| Template output | `facilities/malaga_nla_research.xlsx` (28 KB, 3 sheets: Instructions, Facilities, Operator_Sources) |
| Editable columns | `nla_sqm`, `constructed_area_sqm`, `confidence` (dropdown: high/medium/low), `source_url`, `notes`. Yellow-highlighted in the sheet. |
| Locked columns | All Google-Places fields (id, name, brand, municipio, postal_code, address, lat, lng, place_id, phone, website, rating, rating_count) — must not be edited. |
| Source hierarchy | 1. Operator website (HIGH). 2. Catastro `superficie construida` × 0.70 NLA ratio (MEDIUM). 3. Google Maps footprint × floors × 0.70 (LOW). 4. For guardamuebles (bulk-storage movers), area is secondary — tag in notes. |
| Return file | User saves researched data as `malaga_nla_research_filled.xlsx`. A future merge script will read that back, map `id` → `malaga_facilities.json` entry, and populate `nla_sqm` + `constructed_area_sqm` (renaming the current `nla_m2` field to match Euskadi's schema). |
| Downstream | Once `malaga_facilities.json` has NLA populated, `scripts/prepare-data.js` (pipeline-extension branch) will aggregate per-muni NLA, compute `nla_per_capita` / `nla_per_1000_households`, classify `facility_type` (self_storage vs guardamuebles) and `size_tier` from the NLA value + operator name regex, and feed the 25%-weight NLA-gap component of the opportunity score. |

---

## Consolidated known limitations

### Data vintage gaps vs Euskadi

| Field | Málaga vintage | Euskadi vintage (current) | Gap |
|---|---|---|---|
| Population | 2025-01-01 | 2025-01-01 | — |
| Age structure | **2022-01-01** | 2025-01-01 | **3 years** — INE publishes muni-level age via op 188 Padrón Continuo, and the latest data INE makes available at muni level is 2022-01-01. The newer Estadística Continua de Población (op 450) stops at provincial level. |
| Income (renta media per persona) | 2023 | 2023 | — (same year, different tax administrations — 1-3 % methodology gap per §2d) |
| Housing | 2021-11-01 (Censo 2021) | 2021-11-01 (EUSTAT republishes same census) | — |
| Prices | Q4 2025 | Q4 2025 (currently ECVI útil — migration pending) | — vintage / **unit mismatch** pre-migration |
| Rent (active) | 2024 (SERPAVI) | June 2025 (EMAL A2.3) | 6 months |
| Transactions | 2025 (provisional) | 2025 (same source) | — |

### Coverage gaps vs Euskadi (Málaga-only limitations)

| Field | Gap | Impact |
|---|---|---|
| Housing (tenure, apartment %, surface, total dwellings) | **84 / 103** munis use size-bin aggregate (all munis in same band share one value). Only the 19 munis > 10k hab (by 2021 pop) get per-muni values. | Choropleth for these four fields will render uniform swaths across small munis. Ranking table still works — munis just cluster at bin values. |
| Prices | **91 / 103** munis use provincial fallback (same €2,897/m² Málaga-wide). Only 12 munis > 25k hab (by MIVAU publication rules) get muni-level values. | Same as housing — 91 small munis render identically on the price choropleth. |
| Rents | **37 / 103** munis use provincial fallback (SERPAVI suppresses munis with very thin fiscal rental samples). 66 munis have muni-level data. | Moderate gap in affluent interior munis; acceptable given small rental markets. |
| `avg_rent_sqm` (new contracts) | **null for all 103 munis**. No nationwide muni-level new-contract source identified. | Rent metric in app should prefer `avg_rent_sqm_active` when rendering Málaga. |
| NLA (`nla_sqm`, `nla_per_capita`, `constructed_area_sqm`) | null for all 103 munis, and the 99 facilities in `facilities/malaga_facilities.json` have `nla_m2: null`. | Manual research pass pending. Opportunity score's NLA-gap component (25 % weight) falls back to provincial norm for Málaga munis until this lands — documented downstream. |

### Pending follow-up work

| Task | Blocker for | Branch |
|---|---|---|
| **Euskadi price migration to MIVAU Valor Tasado** | Cross-province price comparison in app | separate branch — this one is data-staging only |
| **Euskadi housing migration to Censo 2021 microdata** (Option A) | Cross-province comparability of tenure / apartment / surface | separate branch |
| **Málaga NLA research** (fill `facilities/malaga_facilities.json` `nla_m2` fields and per-muni `nla_sqm` totals) | Opportunity scoring granularity for Málaga | separate manual pass |
| **Isochrones for Málaga** (10-min + 20-min ORS API) | — | ✅ **DONE** this branch — 103/103 munis + province merges generated via `data/es/malaga/generate_isochrones{,_20}.js`. Catchment metrics still need to be computed (Euskadi-side `catch_*` / `catch20_*` fields in `data/es/master_municipios.json` come from `scripts/prepare-data.js` — pipeline extension needed for Málaga). |
| **Pipeline extension** (`scripts/prepare-data.js` must read Málaga + Euskadi and produce combined `public/data/`) | App serving Málaga data | separate branch |
| **Registradores / IPVVR integration** (if desired) | N/A — not required for current scope | on ice; provincial-only, no municipal value to add |

### Methodology decisions — cross-reference

See §1 (purchase price), §2 (rent), §3 (housing) at the top of this
file for the locked-in decisions and reversal instructions.

### Smoke-test results (final master, 103 munis)

| Total | Value | Cross-check |
|---|---|---|
| Province population 2025 | 1,791,092 | Matches INE published total for Málaga province |
| Province area | 7,308.4 km² | Matches published Málaga province geography |
| Housing sources | 19 muni-microdata + 84 provincial-bin | = 103 |
| Price sources | 12 muni + 91 provincial-fallback | = 103 |
| Rent sources | 41 muni-apt + 25 muni-singlefam + 37 provincial-fallback | = 103 |
| Turnover (annual) | 36,164 transactions (2025) | Sum of 103 munis = provincial annual |
| Fields populated per record | 33 (of which 3 expected-null: `nla_sqm`, `nla_per_capita`, `avg_rent_sqm`) | — |
