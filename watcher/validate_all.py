from __future__ import annotations
import argparse, json, sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    gen = root / "public" / "generated"
    projects_file = gen / "projects.json"
    if not projects_file.exists():
        print("FAIL: public/generated/projects.json missing")
        return 2
    projects = json.loads(projects_file.read_text(encoding="utf-8"))
    ids = [p["project_id"] for p in projects]
    if len(ids) != len(set(ids)):
        print("FAIL: duplicate project_id in registry")
        return 2
    errors = []
    for p in projects:
        pid = p["project_id"]
        latest_path = gen / "projects" / pid / "latest.json"
        if not latest_path.exists():
            errors.append(f"{pid}: latest.json missing")
            continue
        data = json.loads(latest_path.read_text(encoding="utf-8"))
        if data.get("project_id") != pid:
            errors.append(f"{pid}: project isolation mismatch")
        manifest = data.get("manifest", {})
        sheets = manifest.get("sheets", [])
        if manifest.get("sheet_count") != len(sheets):
            errors.append(f"{pid}: sheet completeness mismatch")
        if manifest.get("unaccounted_sheets") != 0:
            errors.append(f"{pid}: unaccounted sheets")
        for sh in sheets:
            raw = root / "public" / sh["raw_path"].lstrip("/")
            if not raw.exists():
                errors.append(f"{pid}: missing raw sheet {raw}")
                continue
            raw_data = json.loads(raw.read_text(encoding="utf-8"))
            if raw_data.get("project_id") != pid:
                errors.append(f"{pid}: cross-project raw sheet {raw}")
    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 2
    print(f"PASS: {len(projects)} project(s); isolation/completeness gates passed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
