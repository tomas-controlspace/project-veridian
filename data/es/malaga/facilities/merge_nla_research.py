"""Merge filled NLA research xlsx back into malaga_facilities.json.

Reads:
  data/es/malaga/facilities/malaga_nla_research_filled.xlsx
  data/es/malaga/facilities/malaga_facilities.json

Updates each facility with:
  - Renames the legacy `nla_m2` field to `nla_sqm` (matches Euskadi schema).
  - Sets `nla_sqm`:
        a) the researched value if `nla_sqm` cell is filled directly,
        b) else `constructed_area_sqm × 0.70` (default ratio per Instructions sheet),
        c) else null.
  - `constructed_area_sqm` (null if researcher entered 0 or blank).
  - `nla_confidence` ("high" / "medium" / "low" / "none").
  - `nla_source_url`.
  - `nla_notes`.
  - `nla_estimated`: true when nla_sqm was derived (b) rather than directly published.

Idempotent — re-running re-applies the same merge; safe to commit + re-run.
"""

import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
XLSX_PATH = HERE / "malaga_nla_research_filled.xlsx"
JSON_PATH = HERE / "malaga_facilities.json"

NLA_RATIO = 0.70  # constructed_area → NLA fallback multiplier (see template Instructions §3b)


def f(v):
    """Coerce excel cell to float|None, treating NaN / 0 / blank as None."""
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        if not v:
            return None
        try:
            v = float(v)
        except ValueError:
            return None
    if pd.isna(v):
        return None
    if isinstance(v, (int, float)) and v > 0:
        return float(v)
    return None


def s(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


df = pd.read_excel(XLSX_PATH, sheet_name="Facilities")
print(f"Loaded {len(df)} rows from {XLSX_PATH.name}")

doc = json.loads(JSON_PATH.read_text(encoding="utf-8"))
by_id = {fac["id"]: fac for fac in doc["facilities"]}
by_name = {fac["name"].strip().lower(): fac for fac in doc["facilities"]}

# Update schema_notes
doc["schema_notes"]["nla_sqm"] = (
    "Net Lettable Area in m². Field renamed from nla_m2 (2026-04-27 NLA research merge) "
    "to match Euskadi schema. Direct value when operator publishes it; otherwise "
    "constructed_area_sqm × 0.70. See nla_estimated flag and nla_confidence."
)
doc["schema_notes"]["constructed_area_sqm"] = (
    "Gross constructed floor area in m² (superficie construida) — primarily from Catastro."
)
doc["schema_notes"]["nla_confidence"] = (
    "Researcher's confidence in the NLA value: high (operator-published), "
    "medium (Catastro × 0.70), low (footprint estimate), none (no source found)."
)
doc["schema_notes"]["nla_source_url"] = "URL of the primary source consulted by the researcher."
doc["schema_notes"]["nla_notes"] = "Researcher notes — Referencia Catastral, # units, special cases."
doc["schema_notes"]["nla_estimated"] = (
    "true if nla_sqm was derived from constructed_area × 0.70 rather than published directly."
)
# Drop the old nla_m2 explanation (renamed)
doc["schema_notes"].pop("nla_m2", None)

stats = {"direct": 0, "estimated": 0, "missing": 0, "by_confidence": {}}
unmatched_ids = []

for _, row in df.iterrows():
    fid = row.get("id")
    name = row.get("name")
    fac = by_id.get(fid) if isinstance(fid, str) else None
    if not fac:
        # Researcher accidentally cleared the id cell — fall back to name match.
        if isinstance(name, str) and name.strip():
            fac = by_name.get(name.strip().lower())
            if fac:
                fid = fac["id"]
                print(f"  recovered NaN-id row by name -> {fid} {name}")
    if not fac:
        unmatched_ids.append(fid if isinstance(fid, str) else f"<no-id, name='{name}'>")
        continue

    direct_nla = f(row.get("nla_sqm"))
    constructed = f(row.get("constructed_area_sqm"))
    confidence = s(row.get("confidence")) or "none"
    source_url = s(row.get("source_url"))
    notes = s(row.get("notes"))

    estimated = False
    if direct_nla is not None:
        nla = round(direct_nla, 1)
        stats["direct"] += 1
    elif constructed is not None:
        nla = round(constructed * NLA_RATIO, 1)
        estimated = True
        stats["estimated"] += 1
    else:
        nla = None
        stats["missing"] += 1

    # Drop legacy nla_m2 field if present (rename → nla_sqm)
    fac.pop("nla_m2", None)
    fac["nla_sqm"] = nla
    fac["constructed_area_sqm"] = round(constructed, 1) if constructed is not None else None
    fac["nla_confidence"] = confidence
    fac["nla_source_url"] = source_url
    fac["nla_notes"] = notes
    fac["nla_estimated"] = estimated

    stats["by_confidence"][confidence] = stats["by_confidence"].get(confidence, 0) + 1

# Refresh summary block
total_nla = sum(f["nla_sqm"] for f in doc["facilities"] if f.get("nla_sqm"))
total_constructed = sum(
    f["constructed_area_sqm"] for f in doc["facilities"] if f.get("constructed_area_sqm")
)
doc["summary"]["nla_total_sqm"] = round(total_nla, 1)
doc["summary"]["constructed_area_total_sqm"] = round(total_constructed, 1)
doc["summary"]["nla_research_completed"] = "2026-04-27"

# Pretty-print, preserve key order
JSON_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")

print()
print(f"  direct NLA values:    {stats['direct']:3}")
print(f"  estimated × 0.70:     {stats['estimated']:3}")
print(f"  missing (no source):  {stats['missing']:3}")
print(f"  by confidence: {stats['by_confidence']}")
if unmatched_ids:
    print(f"  WARN unmatched ids: {unmatched_ids}")
print()
print(f"Province totals — NLA: {total_nla:,.0f} m²   Constructed: {total_constructed:,.0f} m²")
print()
print(f"Wrote {JSON_PATH.relative_to(HERE.parent.parent.parent)} ({JSON_PATH.stat().st_size // 1024} KB)")

# Spot-check a few records
print("\nSpot-check (first 3 + last 1):")
for fid in ["mlg-001", "mlg-002", "mlg-003", "mlg-099"]:
    f0 = by_id.get(fid)
    if not f0:
        continue
    print(
        f"  {fid} {f0['name'][:32]:32} brand={f0['brand']:18} nla={f0.get('nla_sqm')} "
        f"(est={f0.get('nla_estimated')}, conf={f0.get('nla_confidence')})"
    )
