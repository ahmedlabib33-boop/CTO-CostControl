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
    identity_path = gen / "identity-registry.json"
    if not identity_path.exists():
        errors.append("identity-registry.json missing")
        identity_registry = {"projects": []}
    else:
        identity_registry = json.loads(identity_path.read_text(encoding="utf-8"))
    registry_projects = identity_registry.get("projects", [])
    internal_ids = [p.get("internal_project_id") for p in registry_projects]
    if len(internal_ids) != len(set(internal_ids)):
        errors.append("duplicate internal project ID in identity registry")
    for key in ("project_sap_id", "project_code"):
        values = [str(p.get(key)).strip().casefold() for p in registry_projects if p.get(key)]
        if len(values) != len(set(values)):
            errors.append(f"duplicate {key} in identity registry")
    for p in projects:
        pid = p["project_id"]
        latest_path = gen / "projects" / pid / "latest.json"
        if not latest_path.exists():
            errors.append(f"{pid}: latest.json missing")
            continue
        data = json.loads(latest_path.read_text(encoding="utf-8"))
        if data.get("project_id") != pid:
            errors.append(f"{pid}: project isolation mismatch")
        identity = data.get("identity", {})
        if data.get("schema_version", 0) >= 3 and not (identity.get("project_sap_id") or identity.get("project_code")):
            errors.append(f"{pid}: metadata identity missing")
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
            if raw_data.get("source_fingerprint") != data.get("source", {}).get("sha256"):
                errors.append(f"{pid}: raw sheet fingerprint mismatch {raw}")
        for revision in latest_path.parent.glob("history/*/*.json"):
            if revision.name == "latest.json":
                continue
            try:
                rev = json.loads(revision.read_text(encoding="utf-8"))
            except Exception:
                errors.append(f"{pid}: unreadable history revision {revision}")
                continue
            if rev.get("project_id") != pid:
                errors.append(f"{pid}: cross-project history revision {revision}")
            if revision.stem != rev.get("source", {}).get("sha256"):
                errors.append(f"{pid}: history filename/fingerprint mismatch {revision}")
    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 2
    print(f"PASS: {len(projects)} project(s); isolation/completeness gates passed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
