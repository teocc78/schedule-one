"""Build data/catalog/upper-division.json from a catalog export.

Input: a JSON file shaped like a Google Sheets values export, {"values": [[header...], [row...], ...]},
with at least the columns code, subject, number, title, units_min, units_max, description and
source_url (one row per course, from the UCSB General Catalog at catalog.ucsb.edu).

Usage: python3 scripts/build-upper-division.py <export.json>

Keeps upper-division courses (numbers 100 to 199) in the subjects that SUBJECTS lists, and flags
independent study, internships, honors and thesis courses as "special" so the app can group them. Old class-schedule listings that have no
catalog entry are left out.
"""
import json
import re
import sys
from pathlib import Path

SUBJECTS = ["CH E", "CHEM", "CMPSC", "COMM", "ECE", "ECON", "EEMB", "ENGR", "ENV S", "GEOG", "HIST",
            "MATH", "MCDB", "POL S", "PSTAT", "PSY"]

SPECIAL = re.compile(
    r"independent (stud|research|investigation)|internship|directed reading|research assistance"
    r"|honors (thesis|research|seminar)|senior (honors )?(thesis|seminar)|practicum|tutor"
    r"|^undergraduate research$|undergraduate research in |field work"
    r"|^readings in (geography|psychological)",
    re.I,
)


def units(lo: str, hi: str) -> str:
    lo, hi = lo.strip(), hi.strip()
    return f"{lo}-{hi}" if hi and hi != lo else lo


def main(path: str) -> None:
    values = json.load(open(path))["values"]
    head = values[0]
    out = {}
    for raw in values[1:]:
        r = dict(zip(head, raw + [""] * (len(head) - len(raw))))
        if r["subject"] not in SUBJECTS or not re.match(r"^1\d\d", r["number"]):
            continue
        desc = re.sub(r"\s+", " ", r["description"]).strip()
        title = r["title"].strip()
        # Rows with no description, no catalog start date and an all-caps
        # abbreviated title are old class-schedule listings, not courses in the
        # current catalog. Leave them out.
        if not desc and not r.get("effective_start", "").strip() and title == title.upper():
            continue
        entry = {"title": title, "units": units(r["units_min"], r["units_max"])}
        if desc:
            entry["description"] = desc
        if SPECIAL.search(r["title"]):
            entry["special"] = True
        out[r["code"].strip()] = entry

    def key(code: str):
        subj, num = code.rsplit(" ", 1)
        m = re.match(r"(\d+)(.*)", num)
        return (subj, int(m.group(1)), m.group(2))

    doc = {
        "_note": "Upper-division courses (100 to 199) from the UCSB General Catalog 2026-27 "
                 "(catalog.ucsb.edu), for the subjects Schedule One's majors draw on. Descriptions are "
                 "the catalog's own text. special marks independent study, internships, honors and "
                 "thesis courses. Built by scripts/build-upper-division.py.",
        "_catalog_year": "2026-27",
        "courses": {k: out[k] for k in sorted(out, key=key)},
    }
    dest = Path(__file__).resolve().parent.parent / "data" / "catalog" / "upper-division.json"
    dest.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {len(out)} courses to {dest}")


if __name__ == "__main__":
    main(sys.argv[1])
