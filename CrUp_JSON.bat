@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CTO CostControl - Create and Update JSON
cd /d "%~dp0"

set "CRUP_JSON_FILE=%~f0"
set "CRUP_JSON_ROOT=%CD%"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $raw=[IO.File]::ReadAllText($env:CRUP_JSON_FILE); $marker='# PYTHON-PAYLOAD-START'; $pos=$raw.LastIndexOf($marker); if($pos -lt 0){throw 'Python payload marker was not found.'}; $code=$raw.Substring($pos+$marker.Length); $runtime=Join-Path $env:CRUP_JSON_ROOT '.runtime'; [IO.Directory]::CreateDirectory($runtime)|Out-Null; $helper=Join-Path $runtime ('CrUp_JSON_'+[Guid]::NewGuid().ToString('N')+'.py'); try{[IO.File]::WriteAllText($helper,$code,[Text.UTF8Encoding]::new($false)); & python $helper $env:CRUP_JSON_ROOT; $result=$LASTEXITCODE}finally{if(Test-Path -LiteralPath $helper){Remove-Item -LiteralPath $helper -Force}}; exit $result"
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo CrUp_JSON finished.
) else (
  echo CrUp_JSON stopped with an error. No success was assumed.
)
pause
exit /b %RESULT%

# PYTHON-PAYLOAD-START
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(sys.argv[1]).resolve()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from watcher.identity import extract_metadata, resolve_identity
from watcher.watch import scan, stable
from watcher.xlsx_engine import open_source_document, parse_workbook, regenerate_portfolio


OUTPUT = ROOT / "public" / "generated"
INPUT_DIR = ROOT / "INPUT"
OLD_DIR = ROOT / "Old workbooks"


@dataclass
class Candidate:
    source: Path
    fingerprint: str
    project_id: str | None
    project_name: str
    reporting_period: str | None
    identity_status: str
    classification: str
    existing_revision: Path | None
    latest_period: str | None
    metadata: dict
    outcome: dict


def relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path.resolve())


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def aggregate_signature(rows) -> list[tuple[str, str, str]] | None:
    if not isinstance(rows, list):
        return None
    signature: list[tuple[str, str, str]] = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("project_id"):
            return None
        signature.append((
            str(row.get("project_id") or ""),
            str(row.get("reporting_period") or ""),
            str(row.get("source_fingerprint") or ""),
        ))
    return sorted(signature)


def latest_project_signature() -> list[tuple[str, str, str]]:
    signature: list[tuple[str, str, str]] = []
    projects_root = OUTPUT / "projects"
    if not projects_root.exists():
        return signature
    for latest in sorted(projects_root.glob("*/latest.json")):
        data = load_json(latest, None)
        if not isinstance(data, dict) or not data.get("project_id"):
            continue
        signature.append((
            str(data.get("project_id") or ""),
            str(data.get("reporting_period") or ""),
            str(data.get("source", {}).get("sha256") or ""),
        ))
    return sorted(signature)


def aggregate_index_findings() -> tuple[list[str], int]:
    expected = latest_project_signature()
    findings: list[str] = []
    registry_path = OUTPUT / "projects.json"
    registry = load_json(registry_path, None)
    if aggregate_signature(registry) != expected:
        findings.append("public/generated/projects.json is missing, malformed, or out of sync")

    portfolio_path = OUTPUT / "portfolio" / "latest.json"
    portfolio = load_json(portfolio_path, None)
    portfolio_rows = portfolio.get("projects") if isinstance(portfolio, dict) else None
    if aggregate_signature(portfolio_rows) != expected:
        findings.append("public/generated/portfolio/latest.json is missing, malformed, or out of sync")
    elif int(portfolio.get("project_count", -1)) != len(expected):
        findings.append("public/generated/portfolio/latest.json has an incorrect project count")
    return findings, len(expected)


def offer_aggregate_repair() -> tuple[bool, bool]:
    findings, project_count = aggregate_index_findings()
    if not findings:
        print(f"\nGlobal JSON indexes are consistent with {project_count} current project(s).")
        return False, False

    print("\nGLOBAL JSON INDEX REPAIR REQUIRED:")
    for finding in findings:
        print(f"  - {finding}")
    print(f"  - Current per-project latest JSON found: {project_count}")
    print("  - No workbook will be reprocessed and no project/history/raw JSON will be recreated by this repair.")
    print("  - projects.json is the navigation registry; portfolio/latest.json is the required Command Center aggregate.")
    while True:
        answer = input("Type REPAIR to rebuild only those two indexes, N to leave them, or Q to stop: ").strip().upper()
        if answer == "Q":
            return False, True
        if answer in {"N", "NO", "SKIP"}:
            print("Global indexes were left unchanged.")
            return False, False
        if answer == "REPAIR":
            result = regenerate_portfolio(OUTPUT)
            after, _ = aggregate_index_findings()
            if after:
                raise RuntimeError("Global JSON index repair could not be verified.")
            print(f"CONFIRMED: global indexes now contain exactly {result['project_count']} current project(s).")
            return True, False
        print("Type REPAIR, N, or Q.")


def find_revision(fingerprint: str) -> Path | None:
    projects_root = OUTPUT / "projects"
    if not projects_root.exists():
        return None
    return next(projects_root.glob(f"*/history/*/{fingerprint}.json"), None)


def latest_period(project_id: str | None) -> str | None:
    if not project_id:
        return None
    latest = OUTPUT / "projects" / project_id / "latest.json"
    data = load_json(latest, {})
    return data.get("reporting_period")


def period_exists(project_id: str | None, period: str | None) -> bool:
    if not project_id or not period:
        return False
    return (OUTPUT / "projects" / project_id / "history" / period).is_dir()


def inspect_workbook(source: Path) -> Candidate:
    workbook = open_source_document(source)
    try:
        sheets = [workbook.read_sheet(info) for info in workbook.sheets]
        metadata = extract_metadata(sheets)
        outcome = resolve_identity(OUTPUT, metadata)
        fingerprint = workbook.fingerprint
    finally:
        workbook.close()

    project_id = outcome.get("project_id")
    project_name = outcome.get("project_name") or metadata.get("project_name") or "Unresolved Project"
    period = metadata.get("reporting_period")
    existing = find_revision(fingerprint)
    current_latest = latest_period(project_id)

    if existing:
        classification = "UNCHANGED - identical fingerprint already exists"
    elif outcome.get("status") not in {"existing", "new"}:
        classification = f"BLOCKED - identity {outcome.get('status', 'unresolved')}"
    elif outcome.get("status") == "new":
        classification = "CREATE - new project"
    elif period_exists(project_id, period):
        classification = "UPDATE - changed workbook for an existing reporting period"
    elif current_latest and period and period < current_latest:
        classification = "RESTORE - older reporting period will be inserted into history"
    elif current_latest and period and period > current_latest:
        classification = "UPDATE - newer reporting period will become project latest"
    else:
        classification = "UPDATE - new reporting period for an existing project"

    return Candidate(
        source=source,
        fingerprint=fingerprint,
        project_id=project_id,
        project_name=project_name,
        reporting_period=period,
        identity_status=outcome.get("status", "unresolved"),
        classification=classification,
        existing_revision=existing,
        latest_period=current_latest,
        metadata=metadata,
        outcome=outcome,
    )


def target_paths(item: Candidate) -> list[str]:
    if not item.project_id or not item.reporting_period:
        return []
    base = Path("public") / "generated" / "projects" / item.project_id
    period = base / "history" / item.reporting_period
    return [
        str(period / f"{item.fingerprint}.json"),
        str(period / "latest.json"),
        str(base / "latest.json"),
        str(base / "raw" / item.reporting_period / item.fingerprint[:16]),
        str(Path("public") / "generated" / "projects.json"),
        str(Path("public") / "generated" / "portfolio" / "latest.json"),
        str(Path("public") / "generated" / "identity-registry.json"),
    ]


def print_candidate(number: int, total: int, item: Candidate) -> None:
    print("\n" + "=" * 78)
    print(f"SOURCE {number} OF {total}")
    print(f"File:             {relative(item.source)}")
    print(f"Detected action:  {item.classification}")
    print(f"Project:          {item.project_name}")
    print(f"Project ID:       {item.project_id or 'UNRESOLVED'}")
    print(f"Reporting period: {item.reporting_period or 'UNRESOLVED'}")
    print(f"Current latest:   {item.latest_period or 'NONE'}")
    print(f"SHA-256:          {item.fingerprint}")
    print("Metadata dates:")
    print(f"  Report start:             {item.metadata.get('report_start') or 'Missing'}")
    print(f"  Report finish:            {item.metadata.get('report_finish') or 'Missing'}")
    print(f"  Project start:            {item.metadata.get('project_start') or 'Missing'}")
    print(f"  Project finish:           {item.metadata.get('project_finish') or 'Missing'}")
    print(f"  Project finish-EOT:       {item.metadata.get('project_finish_eot') or 'Missing'}")
    print(f"  Effective project finish: {item.metadata.get('effective_project_finish') or 'Missing'}")

    if item.existing_revision:
        print(f"Existing JSON:    {relative(item.existing_revision)}")
    else:
        paths = target_paths(item)
        if paths:
            print("JSON destinations:")
            for path in paths:
                print(f"  - {path}")

    quality = item.metadata.get("quality", [])
    if quality:
        print("Metadata findings:")
        for finding in quality:
            print(f"  - {finding.get('severity', 'info').upper()}: {finding.get('message', '')}")
    if item.outcome.get("reason"):
        print(f"Identity decision: {item.outcome['reason']}")


def ask_action(item: Candidate) -> str:
    if item.classification.startswith("BLOCKED"):
        print("This source cannot create or update project JSON safely.")
        input("Press ENTER to leave it unchanged: ")
        return "skip"

    if item.existing_revision:
        answer = input("Identical JSON already exists. Press ENTER to keep it unchanged, or Q to stop: ").strip().lower()
        return "quit" if answer in {"q", "quit", "exit"} else "keep"

    verb = "CREATE" if item.classification.startswith("CREATE") else "UPDATE"
    if item.classification.startswith("RESTORE"):
        verb = "RESTORE"
    while True:
        answer = input(f"Choose {verb}=write this JSON, N=do not update, or Q=stop: ").strip().upper()
        if answer == verb:
            return "process"
        if answer in {"N", "NO", "SKIP"}:
            return "skip"
        if answer in {"Q", "QUIT", "EXIT"}:
            return "quit"
        print(f"Type {verb}, N, or Q.")


def chronological_periods(project_id: str) -> list[str]:
    history = OUTPUT / "projects" / project_id / "history"
    if not history.exists():
        return []
    return sorted(path.name for path in history.iterdir() if path.is_dir())


def verify_project(project_id: str, expected_fingerprint: str, expected_period: str) -> tuple[bool, list[str], str | None]:
    revision = OUTPUT / "projects" / project_id / "history" / expected_period / f"{expected_fingerprint}.json"
    periods = chronological_periods(project_id)
    latest_file = OUTPUT / "projects" / project_id / "latest.json"
    latest = load_json(latest_file, {})
    latest_value = latest.get("reporting_period")
    expected_latest = periods[-1] if periods else None
    registry = load_json(OUTPUT / "projects.json", [])
    registry_has_project = any(row.get("project_id") == project_id for row in registry)
    valid = revision.exists() and registry_has_project and latest_value == expected_latest
    return valid, periods, latest_value


def collect_sources() -> list[Path]:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OLD_DIR.mkdir(parents=True, exist_ok=True)
    sources = scan(INPUT_DIR) + scan(OLD_DIR)
    unique: dict[Path, Path] = {}
    for source in sources:
        unique[source.resolve()] = source.resolve()
    return sorted(unique.values(), key=lambda path: (str(path.parent).casefold(), path.name.casefold()))


def main() -> int:
    print("=" * 78)
    print("CTO COSTCONTROL - CREATE / UPDATE / RESTORE JSON")
    print(f"New source files: {INPUT_DIR}")
    print(f"Historical source files: {OLD_DIR}")
    print("LOCAL JSON ONLY - nothing is uploaded to GitHub or Vercel by this script.")
    print("Every source is previewed. Nothing is written without your choice.")
    print("projects.json is the project registry; portfolio/latest.json is the Command Center aggregate.")
    print("=" * 78)

    try:
        repaired_indexes, stop_after_repair_prompt = offer_aggregate_repair()
    except Exception as exc:
        print(f"\nFAILED TO REPAIR GLOBAL INDEXES: {exc}")
        return 1
    if stop_after_repair_prompt:
        print("Stopped by user. No workbook was processed.")
        return 0

    sources = collect_sources()
    if not sources:
        if repaired_indexes:
            print("\nNO SUPPORTED SOURCE FILES FOUND. Only the approved global index repair was written.")
        else:
            print("\nNO SUPPORTED SOURCE FILES FOUND. No JSON was changed.")
        return 0

    print(f"\nDetected {len(sources)} supported source file(s). Inspecting metadata and fingerprints...")
    inspected: list[Candidate] = []
    for source in sources:
        try:
            inspected.append(inspect_workbook(source))
        except Exception as exc:
            print(f"FAILED TO INSPECT: {relative(source)} -> {exc}")

    if not inspected:
        print("No source could be inspected. No JSON was changed.")
        return 1

    created = updated = restored = kept = skipped = blocked = failed = 0
    processed_fingerprints: set[str] = set()

    for index, original in enumerate(inspected, 1):
        try:
            if original.fingerprint in processed_fingerprints:
                print(f"\nDUPLICATE IN THIS RUN: {relative(original.source)} - kept unchanged.")
                kept += 1
                continue

            item = inspect_workbook(original.source)
            print_candidate(index, len(inspected), item)
            action = ask_action(item)

            if action == "quit":
                print("\nStopped by user. Remaining sources were not processed.")
                break
            if action == "keep":
                print("CONFIRMED: Existing JSON remains unchanged.")
                kept += 1
                processed_fingerprints.add(item.fingerprint)
                continue
            if action == "skip":
                print("CONFIRMED: No JSON was created or updated for this source.")
                if item.classification.startswith("BLOCKED"):
                    blocked += 1
                else:
                    skipped += 1
                continue

            if not stable(item.source, checks=2, delay=0.25):
                raise RuntimeError("Source is still changing or cannot be read safely.")

            before_latest = item.latest_period
            summary = parse_workbook(item.source, OUTPUT)
            if not summary.get("published_project"):
                blocked += 1
                print(f"BLOCKED: {summary.get('status')}. No project latest/history JSON was updated.")
                continue

            portfolio = regenerate_portfolio(OUTPUT)
            valid, periods, after_latest = verify_project(
                summary["project_id"],
                summary["source"]["sha256"],
                summary["reporting_period"],
            )
            if not valid:
                raise RuntimeError("Generated JSON verification failed; success was not confirmed.")

            processed_fingerprints.add(item.fingerprint)
            if item.classification.startswith("CREATE"):
                created += 1
            elif item.classification.startswith("RESTORE"):
                restored += 1
            else:
                updated += 1

            print("\nCONFIRMED JSON WRITE:")
            print(f"  Revision: public/generated/projects/{summary['project_id']}/history/{summary['reporting_period']}/{summary['source']['sha256']}.json")
            print(f"  Period latest: public/generated/projects/{summary['project_id']}/history/{summary['reporting_period']}/latest.json")
            print(f"  Project latest period: {after_latest}")
            print(f"  Portfolio projects: {portfolio['project_count']}")
            print("  Chronological history:")
            for position, period in enumerate(periods, 1):
                marker = " <- PROJECT LATEST" if period == after_latest else ""
                print(f"    {position}. {period}{marker}")

            if before_latest and summary["reporting_period"] < before_latest:
                print(f"  Older period inserted correctly. Latest remains {before_latest}.")
        except Exception as exc:
            failed += 1
            print(f"\nFAILED: {relative(original.source)} -> {exc}")
            print("No success confirmation was issued for this source.")

    print("\n" + "=" * 78)
    print("RUN SUMMARY")
    print(f"Created projects:         {created}")
    print(f"Updated periods:          {updated}")
    print(f"Restored older periods:   {restored}")
    print(f"Kept unchanged:           {kept}")
    print(f"Skipped by user:          {skipped}")
    print(f"Blocked safely:           {blocked}")
    print(f"Failed:                   {failed}")
    print("=" * 78)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
