from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from .xlsx_engine import SUPPORTED_SOURCE_EXTENSIONS, parse_workbook, regenerate_portfolio, sha256_file
from .publisher import publish


def stable(path: Path, checks: int = 3, delay: float = 1.0) -> bool:
    prev = None
    for _ in range(checks):
        try:
            sig = (path.stat().st_size, path.stat().st_mtime_ns)
        except FileNotFoundError:
            return False
        if prev is not None and sig != prev:
            prev = sig
            time.sleep(delay)
            continue
        prev = sig
        time.sleep(delay)
    try:
        with path.open("rb"):
            pass
        return True
    except OSError:
        return False


def load_state(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"files": {}}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def scan(input_dir: Path) -> list[Path]:
    return sorted(p for p in input_dir.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_SOURCE_EXTENSIONS and not p.name.startswith("~$"))


def main() -> int:
    ap = argparse.ArgumentParser(description="CTO CostControl adaptive local watcher")
    ap.add_argument("--root", default=".")
    ap.add_argument("--input", default=None)
    ap.add_argument("--interval", type=float, default=5.0)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--publish", action="store_true", help="Build, commit, push, and optionally verify Vercel after every valid change")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    input_dir = Path(args.input).resolve() if args.input else (root / "INPUT")
    output = root / "public" / "generated"
    state_path = root / ".runtime" / "watcher-state.json"
    input_dir.mkdir(parents=True, exist_ok=True)
    state = load_state(state_path)
    print(f"Watching {input_dir}")
    while True:
        changed = []
        for path in scan(input_dir):
            key = str(path.resolve())
            try:
                sig = f"{path.stat().st_size}:{path.stat().st_mtime_ns}"
            except FileNotFoundError:
                continue
            old = state["files"].get(key, {})
            if old.get("stat") == sig:
                continue
            if not stable(path):
                continue
            digest = sha256_file(path)
            if old.get("sha256") == digest:
                state["files"][key] = {"stat": sig, "sha256": digest, "status": "duplicate"}
                continue
            try:
                summary = parse_workbook(path, output)
                state["files"][key] = {
                    "stat": sig,
                    "sha256": digest,
                    "status": summary.get("status", "parsed"),
                    "project_id": summary["project_id"],
                    "period": summary["reporting_period"],
                    "updated_at": time.time(),
                }
                changed.append(summary)
                if summary.get("published_project"):
                    print(f"PARSED {path.name} -> {summary['project_id']} {summary['reporting_period']}")
                else:
                    print(f"BLOCKED {path.name} -> {summary.get('status')} (no project data updated)")
            except Exception as exc:
                state["files"][key] = {"stat": sig, "sha256": digest, "status": "failed", "error": str(exc)}
                print(f"FAILED {path}: {exc}")
            save_state(state_path, state)
        if changed:
            portfolio = regenerate_portfolio(output)
            if args.publish:
                publish(root, portfolio["registry_fingerprint"])
        if args.once:
            break
        time.sleep(max(1.0, args.interval))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
