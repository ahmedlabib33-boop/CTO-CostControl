#!/usr/bin/env python3
"""Standalone, read-only workbook-reading tool for CTO CostControl.

This file uses the application's current adaptive source reader but never calls
``parse_workbook``. Therefore it does not create/update project JSON, change the
identity registry, update watcher memory, publish to GitHub, or trigger Vercel.

Accepted source formats are the same as the application reader:
XLSX, XLSM, OTF, XSF, XDF, XML, HTML, and HTM.

Examples:
    py WORKBOOK_READING.py
    py WORKBOOK_READING.py "INPUT\\LMD Cost Report 06.2026.xlsx"
    py WORKBOOK_READING.py --input "Old workbooks" --output report.json
    py WORKBOOK_READING.py --stdout
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from watcher.identity import extract_metadata
from watcher.xlsx_engine import (
    SUPPORTED_SOURCE_EXTENSIONS,
    build_adaptive_normalized,
    detect_capabilities,
    detect_metrics,
    detect_tables,
    open_source_document,
    semantic_workbook_fingerprint,
    sha256_file,
)


ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT / "INPUT"
DEFAULT_OUTPUT = ROOT / ".runtime" / "workbook-reading" / "latest.json"


def _supported(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_SOURCE_EXTENSIONS


def discover_sources(values: Iterable[str]) -> list[Path]:
    """Resolve files/directories, recursively collecting supported sources."""
    requested = list(values)
    candidates = [Path(value).expanduser() for value in requested] if requested else [DEFAULT_INPUT]
    found: dict[str, Path] = {}
    for candidate in candidates:
        path = candidate if candidate.is_absolute() else ROOT / candidate
        path = path.resolve()
        if _supported(path):
            found[str(path).casefold()] = path
        elif path.is_dir():
            for child in path.rglob("*"):
                if _supported(child):
                    resolved = child.resolve()
                    found[str(resolved).casefold()] = resolved
        elif requested:
            raise FileNotFoundError(f"Input does not exist or is unsupported: {path}")
    return sorted(found.values(), key=lambda item: str(item).casefold())


def _metric_summary(metrics: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, block in metrics.items():
        if name.startswith("derived_"):
            result[name] = block
            continue
        if not isinstance(block, dict):
            continue
        preferred = block.get("preferred")
        if isinstance(preferred, dict):
            result[name] = {
                "value": preferred.get("value"),
                "source_sheet": preferred.get("source_sheet"),
                "source_cell": preferred.get("source_cell"),
                "source_label": preferred.get("source_label"),
                "candidate_count": len(block.get("candidates") or []),
            }
    return result


def _learning_summary(normalized: dict[str, Any]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in normalized.get("schema_learning") or []:
        if not isinstance(item, dict):
            continue
        output.append({
            "role": item.get("role"),
            "sheet": item.get("sheet"),
            "learned_sheets": item.get("learned_sheets"),
            "header_row": item.get("header_row"),
            "mapped_fields": item.get("mapped_fields") or item.get("mapping"),
            "confidence": item.get("confidence"),
            "reason": item.get("reason"),
        })
    return output


def read_source(path: Path, include_data: bool = True) -> dict[str, Any]:
    """Read one source without writing to the application's generated-data tree."""
    document = open_source_document(path)
    try:
        sheets = [document.read_sheet(info) for info in document.sheets]
        metadata = extract_metadata(sheets)
        metrics = detect_metrics(sheets)
        capabilities = detect_capabilities(sheets)
        normalized = build_adaptive_normalized(metadata, metrics, sheets)
        sheet_inventory = []
        for sheet in sheets:
            tables = detect_tables(sheet)
            sheet_inventory.append({
                "name": sheet.get("name"),
                "state": sheet.get("state"),
                "dimension": sheet.get("dimension"),
                "cell_count": sheet.get("cell_count", 0),
                "chart_count": len(sheet.get("charts") or []),
                "detected_table_count": len(tables),
                "detected_tables": tables,
            })

        result: dict[str, Any] = {
            "status": "read",
            "source": {
                "path": str(path),
                "filename": path.name,
                "format": document.source_format,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "semantic_fingerprint": semantic_workbook_fingerprint(sheets),
            },
            "metadata": metadata,
            "metrics": _metric_summary(metrics),
            "capabilities": capabilities,
            "counts": normalized.get("counts") or {},
            "schema_learning": _learning_summary(normalized),
            "sheets": sheet_inventory,
        }
        if include_data:
            result["normalized_data"] = normalized
        return result
    finally:
        document.close()


def run(paths: list[Path], include_data: bool = True) -> dict[str, Any]:
    readings: list[dict[str, Any]] = []
    for path in paths:
        try:
            readings.append(read_source(path, include_data=include_data))
        except Exception as exc:
            readings.append({
                "status": "rejected",
                "source": {"path": str(path), "filename": path.name},
                "error_type": type(exc).__name__,
                "error": str(exc),
            })
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only_no_project_json_updates",
        "source_count": len(paths),
        "read_count": sum(item.get("status") == "read" for item in readings),
        "rejected_count": sum(item.get("status") == "rejected" for item in readings),
        "readings": readings,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read supported cost-control workbooks/SAP forms without updating application JSON."
    )
    parser.add_argument(
        "sources",
        nargs="*",
        help="Source file(s) or folder(s). Default: INPUT",
    )
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        help="Additional source file/folder; may be supplied more than once.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Reading JSON path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Exclude full normalized rows while retaining metadata, counts, mappings, and evidence.",
    )
    parser.add_argument("--stdout", action="store_true", help="Print JSON instead of writing a file.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = discover_sources([*args.sources, *args.input])
    if not paths:
        print(f"NO SUPPORTED SOURCES FOUND: {DEFAULT_INPUT}")
        return 2

    payload = run(paths, include_data=not args.summary_only)
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    if args.stdout:
        print(encoded)
    else:
        output = args.output.expanduser()
        if not output.is_absolute():
            output = ROOT / output
        output = output.resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(encoded, encoding="utf-8")
        print(f"WORKBOOK READING: {payload['read_count']} read, {payload['rejected_count']} rejected")
        for item in payload["readings"]:
            source = item.get("source") or {}
            if item.get("status") == "read":
                metadata = item.get("metadata") or {}
                print(
                    f"READ: {source.get('filename')} -> "
                    f"{metadata.get('project_name') or 'Unresolved project'} -> "
                    f"{metadata.get('reporting_period') or 'Unknown period'}"
                )
            else:
                print(f"REJECTED: {source.get('filename')} -> {item.get('error')}")
        print(f"OUTPUT: {output}")
        print("APPLICATION JSON: unchanged")
    return 0 if payload["rejected_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
