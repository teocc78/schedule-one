"""Build data/catalog/ge-courses.json from a catalog export.

Input: a JSON file shaped like a Google Sheets values export, {"values": [[header...], [row...], ...]},
with at least the columns code, title, units_min, ge_areas and special_areas (one row per course,
from the UCSB General Catalog at catalog.ucsb.edu).

Usage: python3 scripts/build-ge-courses.py <export.json>

Keeps lower-division courses (numbers under 100) that count toward a GE area. Schedule One uses
this to work out which GE areas a transcript already covers and which suggested GE courses
would fill what is left.
"""
import json
import re
import sys
from pathlib import Path


def main(path: str) -> None:
    values = json.load(open(path))["values"]
    head = values[0]
    out = {}
    for raw in values[1:]:
        r = dict(zip(head, raw + [""] * (len(head) - len(raw))))
        code = re.sub(r"\s+", " ", r["code"]).strip()
        m = re.search(r"(\d+)", code.rsplit(" ", 1)[-1])
        if not m or int(m.group(1)) >= 100:
            continue
        ge = [a.strip() for a in r["ge_areas"].split(",") if a.strip()]
        if not ge or code in out:
            continue
        entry = {"title": r["title"].strip(), "units": int(float(r["units_min"] or 0)), "ge": ge}
        specials = [s.strip() for s in r["special_areas"].split(",") if s.strip()]
        if specials:
            entry["specials"] = specials
        out[code] = entry
    doc = {
        "_note": "Lower-division courses that count toward a GE area, with their GE areas and special "
        "subjects, from the UCSB General Catalog 2026-27 (catalog.ucsb.edu). Built by "
        "scripts/build-ge-courses.py.",
        "_catalog_year": "2026-27",
        "courses": dict(sorted(out.items())),
    }
    dest = Path(__file__).resolve().parent.parent / "data" / "catalog" / "ge-courses.json"
    dest.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(out)} GE courses -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1])
