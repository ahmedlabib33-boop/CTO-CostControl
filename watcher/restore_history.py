from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .watch import scan, stable
from .xlsx_engine import parse_workbook, regenerate_portfolio, sha256_file


def _already_generated(output_root: Path, fingerprint: str) -> Path | None:
    projects_root = output_root / "projects"
    if not projects_root.exists():
        return None
    return next(projects_root.glob(f"*/history/*/{fingerprint}.json"), None)


def restore(root: Path, source_dir: Path) -> dict:
    output_root = root / "public" / "generated"
    source_dir.mkdir(parents=True, exist_ok=True)
    workbooks = scan(source_dir)
    result = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "source_directory": str(source_dir),
        "workbook_count": len(workbooks),
        "restored": [], "already_present": [], "blocked": [], "failed": [],
    }
    for source in workbooks:
        try:
            if not stable(source, checks=2, delay=0.25):
                raise RuntimeError("Workbook is not stable/readable")
            fingerprint = sha256_file(source)
            existing = _already_generated(output_root, fingerprint)
            if existing:
                result["already_present"].append({"workbook": source.name, "sha256": fingerprint, "history_file": str(existing.relative_to(root))})
                print(f"ALREADY PRESENT {source.name} -> {existing.relative_to(root)}")
                continue
            summary = parse_workbook(source, output_root)
            if summary.get("published_project"):
                item = {"workbook": source.name, "sha256": fingerprint, "project_id": summary["project_id"], "reporting_period": summary["reporting_period"]}
                result["restored"].append(item)
                print(f"RESTORED {source.name} -> {summary['project_id']} {summary['reporting_period']}")
            else:
                item = {"workbook": source.name, "sha256": fingerprint, "status": summary.get("status"), "quality": summary.get("quality", [])}
                result["blocked"].append(item)
                print(f"BLOCKED {source.name} -> {summary.get('status')} (no project latest/history updated)")
        except Exception as exc:
            result["failed"].append({"workbook": source.name, "error": str(exc)})
            print(f"FAILED {source.name} -> {exc}")
    portfolio_path = output_root / "portfolio" / "latest.json"
    if result["restored"] or not portfolio_path.exists():
        portfolio = regenerate_portfolio(output_root)
    else:
        portfolio = json.loads(portfolio_path.read_text(encoding="utf-8"))
    result["portfolio_project_count"] = portfolio["project_count"]
    result["registry_fingerprint"] = portfolio["registry_fingerprint"]
    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    report_path = root / ".runtime" / "restore-old-workbooks-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"REPORT {report_path}")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore historical project periods from metadata-controlled Excel or SAP form sources.")
    parser.add_argument("--root", default=".")
    parser.add_argument("--source", default=None)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    source_dir = Path(args.source).resolve() if args.source else root / "Old workbooks"
    result = restore(root, source_dir)
    if result["workbook_count"] == 0:
        print("NO SOURCES FOUND: add .xlsx/.xlsm/.otf/.xsf/.xdf/.xml/.html files to the Old workbooks folder.")
        return 3
    if result["blocked"] or result["failed"]:
        print(f"RESTORE COMPLETED WITH BLOCKS/FAILURES: blocked={len(result['blocked'])} failed={len(result['failed'])}")
        return 2
    print(f"RESTORE COMPLETE: restored={len(result['restored'])} already_present={len(result['already_present'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
