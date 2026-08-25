from __future__ import annotations
import argparse
from pathlib import Path
from .xlsx_engine import parse_workbook, regenerate_portfolio


def main() -> int:
    ap = argparse.ArgumentParser(description="Parse one or more cost-control XLSX workbooks into isolated web datasets.")
    ap.add_argument("sources", nargs="+", help="XLSX workbook(s)")
    ap.add_argument("--output", default="public/generated", help="Generated web-data root")
    args = ap.parse_args()
    out = Path(args.output).resolve()
    for src in args.sources:
        summary = parse_workbook(Path(src).resolve(), out)
        print(f"OK {summary['project_id']} {summary['reporting_period']} sheets={summary['manifest']['sheet_count']} charts={summary['manifest']['excel_chart_count']}")
    portfolio = regenerate_portfolio(out)
    print(f"PORTFOLIO projects={portfolio['project_count']} fingerprint={portfolio['registry_fingerprint']}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
