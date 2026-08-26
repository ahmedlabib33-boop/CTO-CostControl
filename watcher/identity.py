from __future__ import annotations

import hashlib
import json
import re
import shutil
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


LABELS = {
    "project sap id": "project_sap_id",
    "sap project id": "project_sap_id",
    "project code": "project_code",
    "project name": "project_name",
    "report start": "report_start",
    "report finish": "report_finish",
}


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value if value is not None else "")).strip()


def normalize_label(value: Any) -> str:
    return _text(value).casefold()


def canonical_identifier(value: Any) -> str:
    """Canonical lookup key; the original identifier is retained for display/audit."""
    return unicodedata.normalize("NFKC", _text(value)).casefold()


def identifier_from_cell(cell: dict[str, Any] | None) -> str | None:
    if not cell:
        return None
    value = cell.get("value")
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        fmt = str(cell.get("number_format") or "")
        simple = re.fullmatch(r"0+", fmt)
        return str(value).zfill(len(fmt)) if simple else str(value)
    if isinstance(value, float):
        if not value.is_integer():
            return _text(value)
        fmt = str(cell.get("number_format") or "")
        simple = re.fullmatch(r"0+", fmt)
        raw = str(int(value))
        return raw.zfill(len(fmt)) if simple else raw
    out = _text(value)
    return out or None


def _excel_serial(value: float) -> date | None:
    if not (1 <= value <= 2958465):
        return None
    try:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
    except (OverflowError, ValueError):
        return None


def parse_date_cell(cell: dict[str, Any] | None) -> tuple[str | None, str | None]:
    """Return ISO date and an audit/error message.

    Numeric values are accepted as Excel serials when the cell uses a date number
    format. Text parsing supports ISO, month names, dot/dash/slash forms, and
    rejects genuinely ambiguous all-numeric day/month values.
    """
    if not cell or cell.get("value") in (None, ""):
        return None, "missing"
    value = cell.get("value")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if cell.get("is_date_format"):
            parsed = _excel_serial(float(value))
            return (parsed.isoformat(), None) if parsed else (None, "invalid Excel serial date")
        return None, "numeric date has no Excel date format"
    raw = _text(value)
    if not raw:
        return None, "missing"
    formats = [
        "%Y-%m-%d", "%d-%b-%Y", "%d-%B-%Y", "%d %b %Y", "%d %B %Y",
        "%d.%m.%Y", "%d-%m-%Y", "%m-%d-%Y", "%d.%m.%y", "%d-%m-%y", "%m-%d-%y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).date().isoformat(), None
        except ValueError:
            pass
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})", raw)
    if match:
        first, second, year = map(int, match.groups())
        year = year + (2000 if year < 70 else 1900) if year < 100 else year
        if first <= 12 and second <= 12 and first != second:
            return None, f"ambiguous text date: {raw}"
        day, month = (first, second) if first > 12 else (second, first)
        try:
            return date(year, month, day).isoformat(), None
        except ValueError:
            return None, f"invalid text date: {raw}"
    return None, f"unsupported or invalid text date: {raw}"


def extract_metadata(sheets: list[dict[str, Any]]) -> dict[str, Any]:
    metadata_sheet = next((s for s in sheets if normalize_label(s.get("name")) == "metadata"), None)
    result: dict[str, Any] = {
        "sheet_found": bool(metadata_sheet), "sheet_state": metadata_sheet.get("state") if metadata_sheet else None,
        "project_sap_id": None, "project_code": None, "project_name": None,
        "report_start": None, "report_finish": None, "reporting_period": None,
        "source_values": {}, "evidence": [], "quality": [],
    }
    if not metadata_sheet:
        result["quality"].append({"severity": "critical", "code": "METADATA_SHEET_MISSING", "message": "Required metadata worksheet was not found."})
        return result
    by_ref = {(c.get("row"), c.get("col")): c for c in metadata_sheet.get("cells", [])}
    for row in sorted({r for r, _ in by_ref if r}):
        label_cell = by_ref.get((row, 1))
        key = LABELS.get(normalize_label(label_cell.get("value") if label_cell else None))
        if not key:
            continue
        value_cell = by_ref.get((row, 2))
        result["source_values"][key] = value_cell.get("value") if value_cell else None
        result["evidence"].append(f"metadata:{metadata_sheet['name']}!A{row}:B{row}")
        if key in {"project_sap_id", "project_code"}:
            result[key] = identifier_from_cell(value_cell)
        elif key == "project_name":
            result[key] = _text(value_cell.get("value") if value_cell else None) or None
        else:
            parsed, error = parse_date_cell(value_cell)
            result[key] = parsed
            if error:
                result["quality"].append({
                    "severity": "critical", "code": f"{key.upper()}_UNRESOLVED",
                    "message": f"Metadata {key.replace('_', ' ')} could not be parsed safely: {error}.",
                })
    if result["report_start"] and result["report_finish"]:
        result["reporting_period"] = f"{result['report_start']}_to_{result['report_finish']}"
    elif not any(q["code"].endswith("_UNRESOLVED") for q in result["quality"]):
        result["quality"].append({"severity": "critical", "code": "REPORT_PERIOD_UNRESOLVED", "message": "Both report start and report finish are required to establish report history identity."})
    return result


def _registry_path(output_root: Path) -> Path:
    return output_root / "identity-registry.json"


def load_identity_registry(output_root: Path) -> dict[str, Any]:
    path = _registry_path(output_root)
    if path.exists():
        try:
            registry = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            registry = {"schema_version": 1, "projects": []}
    else:
        registry = {"schema_version": 1, "projects": []}
    registry.setdefault("projects", [])
    known = {p.get("internal_project_id") for p in registry["projects"]}
    projects_root = output_root / "projects"
    if projects_root.exists():
        for latest in sorted(projects_root.glob("*/latest.json")):
            if latest.parent.name in known:
                continue
            try:
                data = json.loads(latest.read_text(encoding="utf-8"))
            except Exception:
                continue
            registry["projects"].append({
                "internal_project_id": data.get("project_id", latest.parent.name),
                "project_sap_id": data.get("identity", {}).get("project_sap_id"),
                "project_code": data.get("identity", {}).get("project_code"),
                "project_name": data.get("project_name", latest.parent.name),
                "identity_creation_source": "legacy_generated_data",
                "identity_history": [],
                "created_at": data.get("generated_at"),
                "latest_processed_reporting_period": data.get("reporting_period"),
                "latest_validated_source_fingerprint": data.get("source", {}).get("sha256"),
            })
    migration_path = output_root.parent.parent / "config" / "project-identity-migration.json"
    if migration_path.exists():
        try:
            migrations = json.loads(migration_path.read_text(encoding="utf-8"))
        except Exception:
            migrations = {}
        for project in registry["projects"]:
            mapped = migrations.get(project.get("internal_project_id"), {}) if isinstance(migrations, dict) else {}
            for key in ("project_sap_id", "project_code"):
                if mapped.get(key):
                    project[key] = _text(mapped[key])
            if mapped:
                project["identity_creation_source"] = "controlled_legacy_migration"
    return registry


def save_identity_registry(output_root: Path, registry: dict[str, Any]) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    registry["updated_at"] = datetime.now(timezone.utc).isoformat()
    _registry_path(output_root).write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")


def _unique_namespace(output_root: Path, project_name: str | None, sap_id: str | None, code: str | None) -> str:
    label = project_name or "project"
    base = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-").lower() or "project"
    digest = hashlib.sha256(f"{canonical_identifier(sap_id)}|{canonical_identifier(code)}".encode()).hexdigest()[:8]
    candidate = base
    registered = {p.get("internal_project_id") for p in load_identity_registry(output_root)["projects"]}
    if candidate in registered or (output_root / "projects" / candidate).exists():
        candidate = f"{base}-{digest}"
    return candidate


def resolve_identity(output_root: Path, metadata: dict[str, Any]) -> dict[str, Any]:
    registry = load_identity_registry(output_root)
    sap, code = metadata.get("project_sap_id"), metadata.get("project_code")
    sap_key, code_key = canonical_identifier(sap), canonical_identifier(code)
    sap_matches = [p for p in registry["projects"] if sap_key and canonical_identifier(p.get("project_sap_id")) == sap_key]
    code_matches = [p for p in registry["projects"] if code_key and canonical_identifier(p.get("project_code")) == code_key]
    sap_project = sap_matches[0] if len(sap_matches) == 1 else None
    code_project = code_matches[0] if len(code_matches) == 1 else None
    reason = ""
    status = ""
    project = None
    if len(sap_matches) > 1 or len(code_matches) > 1:
        status, reason = "conflict", "The identity registry contains a non-unique SAP Project ID or Project Code and cannot resolve safely."
    elif not sap_key and not code_key:
        status, reason = "unresolved", "Both SAP Project ID and Project Code are missing."
    elif sap_key and code_key:
        if sap_project and code_project and sap_project["internal_project_id"] == code_project["internal_project_id"]:
            status, project = "existing", sap_project
        elif not sap_project and not code_project:
            status = "new"
        elif not sap_project and code_project:
            status, reason = "conflict", "Incoming SAP Project ID is new, but Project Code belongs to an existing project."
        elif sap_project and not code_project:
            status, reason = "conflict", "Incoming SAP Project ID belongs to an existing project, but Project Code is new."
        else:
            status, reason = "conflict", "SAP Project ID and Project Code resolve to different registered projects."
    elif sap_key:
        status, project = ("existing", sap_project) if sap_project else ("new", None)
    else:
        status, project = ("existing", code_project) if code_project else ("new", None)
    if status == "new" and metadata.get("project_name"):
        same_name_legacy = [p for p in registry["projects"] if not p.get("project_sap_id") and not p.get("project_code")
                            and canonical_identifier(p.get("project_name")) == canonical_identifier(metadata.get("project_name"))]
        if same_name_legacy:
            status = "unresolved"
            reason = ("A legacy generated project has the same display name but no registered metadata identifiers. "
                      "Automatic creation was blocked; complete config/project-identity-migration.json to prevent a duplicate namespace.")
    if status in {"existing", "new"} and not metadata.get("reporting_period"):
        status, reason = "unresolved", "Report start/report finish could not establish a safe reporting period."
    project_id = project.get("internal_project_id") if project else None
    if status == "new":
        project_id = _unique_namespace(output_root, metadata.get("project_name"), sap, code)
    return {
        "status": status, "reason": reason, "project_id": project_id,
        "project_name": metadata.get("project_name") or (project or {}).get("project_name") or "Unnamed Project",
        "registry": registry,
        "matched_existing_identifier": "SAP Project ID" if sap_project else ("Project Code" if code_project else None),
        "conflicting_existing_project": (code_project or sap_project or {}).get("internal_project_id") if status == "conflict" else None,
        "matched_sap_project": sap_project.get("internal_project_id") if sap_project else None,
        "matched_code_project": code_project.get("internal_project_id") if code_project else None,
    }


def record_identity_problem(output_root: Path, metadata: dict[str, Any], source: Path, fingerprint: str, outcome: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    local_evidence_dir = output_root.parent.parent / ".runtime" / "identity-problems" / fingerprint
    local_evidence_dir.mkdir(parents=True, exist_ok=True)
    local_evidence = local_evidence_dir / source.name
    if not local_evidence.exists():
        shutil.copy2(source, local_evidence)
    is_conflict = outcome["status"] == "conflict"
    code = "PROJECT_IDENTITY_CONFLICT_CRITICAL" if is_conflict else "PROJECT_IDENTITY_UNRESOLVED_CRITICAL"
    title = "PROJECT IDENTITY CONFLICT — CRITICAL" if is_conflict else "PROJECT IDENTITY UNRESOLVED — CRITICAL"
    message = (
        "The supplied SAP Project ID and Project Code do not resolve consistently against the registered project identities. "
        "Automatic project identification/update was blocked to prevent cross-project data contamination. "
        "No existing project data was merged or overwritten."
        if is_conflict else
        "Automatic project identification/update was blocked because authoritative metadata identity or reporting dates were unresolved. "
        "No existing project data was merged or overwritten."
    )
    evidence = {
        "incoming_project_sap_id": metadata.get("project_sap_id"), "incoming_project_code": metadata.get("project_code"),
        "incoming_project_name": metadata.get("project_name"), "report_start": metadata.get("report_start"),
        "report_finish": metadata.get("report_finish"), "matched_existing_identifier": outcome.get("matched_existing_identifier"),
        "conflicting_existing_project": outcome.get("conflicting_existing_project"), "source_workbook_filename": source.name,
        "matched_sap_project": outcome.get("matched_sap_project"), "matched_code_project": outcome.get("matched_code_project"),
        "sha256_fingerprint": fingerprint, "detection_timestamp": now, "conflict_reason": outcome.get("reason"),
        "local_evidence_copy": f".runtime/identity-problems/{fingerprint}/{source.name}",
    }
    record = {
        "status": outcome["status"], "severity": "critical", "code": code, "title": title,
        "message": message, "evidence": evidence, "metadata_quality": metadata.get("quality", []),
    }
    problem_dir = output_root / "identity-problems"
    problem_dir.mkdir(parents=True, exist_ok=True)
    (problem_dir / f"{fingerprint}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    index_path = output_root / "identity-conflicts.json"
    existing = []
    if index_path.exists():
        try:
            existing = json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    existing = [x for x in existing if x.get("evidence", {}).get("sha256_fingerprint") != fingerprint]
    existing.insert(0, record)
    index_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    return record


def register_validated_identity(output_root: Path, outcome: dict[str, Any], metadata: dict[str, Any], fingerprint: str) -> None:
    registry = outcome["registry"]
    now = datetime.now(timezone.utc).isoformat()
    project = next((p for p in registry["projects"] if p.get("internal_project_id") == outcome["project_id"]), None)
    if project is None:
        project = {
            "internal_project_id": outcome["project_id"], "identity_creation_source": "metadata_sheet",
            "identity_history": [], "created_at": now,
        }
        registry["projects"].append(project)
    previous = {k: project.get(k) for k in ("project_sap_id", "project_code", "project_name")}
    current = {k: metadata.get(k) or project.get(k) for k in ("project_sap_id", "project_code", "project_name")}
    if previous != current and any(previous.values()):
        project.setdefault("identity_history", []).append({"changed_at": now, **previous})
    project.update(current)
    project["latest_processed_reporting_period"] = metadata.get("reporting_period")
    project["latest_validated_source_fingerprint"] = fingerprint
    save_identity_registry(output_root, registry)
