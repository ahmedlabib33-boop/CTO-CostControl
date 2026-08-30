#!/usr/bin/env python3
"""Standalone CTO CostControl live-reading engine.

Reads the application's current generated project registry and normalized JSON,
then writes controlled, deterministic intelligence results. It never edits the
source JSON and never invents missing financial values.

Examples:
    py LIVE_READING.py
    py LIVE_READING.py --project bridge
    py LIVE_READING.py --output C:\\Temp\\live-intelligence.json
    py LIVE_READING.py --stdout
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parent
GENERATED = ROOT / "public" / "generated"
DEFAULT_OUTPUT = ROOT / ".runtime" / "live-reading" / "latest.json"


@dataclass(frozen=True)
class Policy:
    version: int = 1
    cpi_favorable: float = 1.00
    cpi_caution: float = 0.95
    cv_critical_pct: float = -5.0
    margin_target_pct: float = 0.0
    cash_deficit_critical_pct: float = 15.0
    waste_caution_points: float = 1.0
    waste_critical_points: float = 3.0
    reconciliation_caution_pct: float = 1.0
    reconciliation_critical_pct: float = 5.0
    concentration_caution_pct: float = 25.0
    concentration_critical_pct: float = 40.0
    minimum_trend_periods: int = 3


def finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def rows(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def first_number(*values: Any) -> float | None:
    for value in values:
        number = finite(value)
        if number is not None:
            return number
    return None


def sum_field(items: list[dict[str, Any]], key: str) -> float | None:
    values = [value for item in items if (value := finite(item.get(key))) is not None]
    return sum(values) if values else None


def preferred(data: dict[str, Any], key: str) -> float | None:
    block = data.get("metrics", {}).get(key)
    if isinstance(block, dict):
        return finite((block.get("preferred") or {}).get("value"))
    return finite(block)


def source_evidence(data: dict[str, Any], component: str) -> list[str]:
    source = data.get("source") or {}
    return [
        f"{source.get('filename', 'Unknown source')} · {data.get('reporting_period', 'Unknown period')}",
        f"{component} · SHA-256 {str(source.get('sha256', ''))[:16]}…",
    ]


def result_base(data: dict[str, Any], component_id: str, name: str, family: str,
                component_type: str, metrics: dict[str, float | None]) -> dict[str, Any]:
    return {
        "componentId": component_id,
        "componentName": name,
        "componentType": component_type,
        "family": family,
        "projectId": data.get("project_id"),
        "projectName": data.get("project_name"),
        "period": data.get("reporting_period"),
        "revision": (data.get("source") or {}).get("sha256"),
        "status": "informational",
        "confidence": 1.0 if (data.get("approved_parity") or {}).get("matched") else 0.86,
        "assessmentBasis": "derived",
        "metrics": metrics,
        "meaning": "This component presents controlled project-cost evidence.",
        "indication": "The values are available for management review.",
        "reason": "No unsupported judgment has been applied.",
        "risks": [],
        "benefits": [],
        "decision": "Review the evidence in its stated accounting and reporting scope.",
        "mitigation": [],
        "keepOnTrack": [],
        "ruleApplied": "Evidence-only assessment",
        "thresholds": {},
        "sourceEvidence": source_evidence(data, name),
        "unavailableReason": None,
    }


def unavailable(result: dict[str, Any], reason: str) -> dict[str, Any]:
    result.update({
        "status": "unavailable",
        "confidence": 0.0,
        "indication": "Unable to assess.",
        "reason": reason,
        "decision": "Resolve the missing or low-confidence source data before making a financial decision.",
        "ruleApplied": "Missing-data guard",
        "unavailableReason": reason,
    })
    return result


def cost_performance(data: dict[str, Any], norm: dict[str, Any], policy: Policy) -> dict[str, Any]:
    kpis = norm.get("kpis") or {}
    ev = first_number(kpis.get("ev_dashboard_scope"), preferred(data, "earned_value"))
    ac = first_number(kpis.get("actual_cost_dashboard_scope"), preferred(data, "actual_cost"))
    budget = first_number(kpis.get("total_budget_cost"), preferred(data, "budget"))
    cv = ev - ac if ev is not None and ac is not None else None
    cpi = ev / ac if ev is not None and ac not in (None, 0) else None
    result = result_base(data, "executive-cost-position", "Executive Cost Position", "executive", "kpi", {
        "budget": budget, "earnedValue": ev, "actualCost": ac, "costVariance": cv, "cpi": cpi,
    })
    if ev is None or ac is None:
        return unavailable(result, "Earned Value and Actual Cost are not both available on a comparable scope.")
    if ev == 0 and ac == 0:
        return unavailable(result, "Earned Value and Actual Cost are both zero, so efficiency cannot yet be assessed.")
    cv_pct = cv / abs(ev) * 100 if ev else None
    result["meaning"] = "Compares value earned with cost consumed on the same reporting scope."
    result["thresholds"] = {"cpiFavorable": policy.cpi_favorable, "cpiCaution": policy.cpi_caution, "cvCriticalPct": policy.cv_critical_pct}
    result["ruleApplied"] = "CPI and normalized CV/EV policy"
    if (cpi is not None and cpi < policy.cpi_caution) or (cv_pct is not None and cv_pct < policy.cv_critical_pct):
        result.update(status="critical", indication="Cost performance is materially off track.", reason="CPI or CV crossed the critical policy boundary.", risks=["Forecast cost growth and margin erosion if current efficiency continues."], decision="Require a cost-recovery plan for the largest adverse work packages.", mitigation=["Rank negative-CV items by value and owner.", "Reforecast ETC using current productivity and commitments."])
    elif (cpi is not None and cpi < policy.cpi_favorable) or (cv_pct is not None and cv_pct < 0):
        result.update(status="caution", indication="Cost performance is under pressure.", reason="CPI is below target or CV is slightly adverse.", risks=["A small efficiency loss can compound across remaining scope."], decision="Keep the project under weekly exception review.", mitigation=["Review leading adverse cost codes and remaining quantities."])
    else:
        result.update(status="favorable", indication="Cost efficiency is on track against current earned-value evidence.", reason="CPI and CV meet the configured favorable boundaries.", benefits=["The project is earning at least as much value as cost consumed on this scope."], decision="Maintain current controls and protect the favorable variance.", keepOnTrack=["Continue monthly CPI/CV trend review."])
    return result


def profitability(data: dict[str, Any], norm: dict[str, Any], policy: Policy) -> dict[str, Any]:
    methods = rows(norm.get("profitability"))
    chosen = next((item for item in methods if "revenue" in str(item.get("method", "")).lower()), methods[0] if methods else {})
    profit = finite(chosen.get("profit"))
    margin = finite(chosen.get("profit_pct"))
    result = result_base(data, "profitability", "Profitability", "executive", "chart", {"profit": profit, "margin": margin, "methodCount": float(len(methods))})
    if profit is None and margin is None:
        return unavailable(result, "No controlled profit method is available.")
    margin_pct = margin * 100 if margin is not None else None
    result["meaning"] = "Shows commercial return without merging different workbook profit methods."
    result["thresholds"] = {"marginTargetPct": policy.margin_target_pct}
    result["ruleApplied"] = "Profit sign and configured margin floor"
    if (profit is not None and profit < 0) or (margin_pct is not None and margin_pct < 0):
        result.update(status="critical", indication="The selected commercial basis indicates a loss.", reason="Profit or margin is negative.", risks=["Direct erosion of project return."], decision="Escalate loss drivers and approve a documented recovery scenario.", mitigation=["Separate cost overrun, revenue shortfall, deductions, and claims exposure."])
    elif margin_pct is None or margin_pct < policy.margin_target_pct:
        result.update(status="caution", indication="Profit is non-negative but below the configured margin target.", reason="Positive profit alone is not treated as sufficient performance.", risks=["Remaining margin may be too thin to absorb forecast risk."], decision="Protect margin and validate remaining revenue and cost exposure.")
    else:
        result.update(status="favorable", indication="The selected source method meets the configured margin target.", reason="Profit is positive and margin meets policy.", benefits=["Current commercial evidence provides a positive buffer."], decision="Maintain revenue realization and cost discipline.", keepOnTrack=["Track deductions, unbilled revenue, and forecast-to-complete monthly."])
    return result


def cashflow(data: dict[str, Any], norm: dict[str, Any], policy: Policy) -> dict[str, Any]:
    timeline = rows(norm.get("cashflow"))
    last = timeline[-1] if timeline else {}
    cash_in = finite(last.get("cash_in_cum"))
    cash_out = finite(last.get("cash_out_cum"))
    net = cash_in - cash_out if cash_in is not None and cash_out is not None else None
    result = result_base(data, "cumulative-cashflow", "Cumulative Cashflow / S-Curve", "executive", "chart", {"periods": float(len(timeline)), "cumulativeCashIn": cash_in, "cumulativeCashOut": cash_out, "cumulativeNet": net})
    if cash_in is None or cash_out is None:
        return unavailable(result, "Cumulative cash-in and cash-out are not both available.")
    if cash_in == 0 and cash_out == 0:
        return unavailable(result, "Cash in and cash out are both zero, so no conclusion is supported.")
    deficit_pct = abs(net) / abs(cash_in) * 100 if net is not None and net < 0 and cash_in else 0
    result["meaning"] = "Compares cumulative cash recovery with cumulative cash expenditure."
    result["thresholds"] = {"cashDeficitCriticalPct": policy.cash_deficit_critical_pct}
    result["ruleApplied"] = "Cash deficit normalized to cash in"
    if deficit_pct >= policy.cash_deficit_critical_pct:
        result.update(status="critical", indication="Cash out materially exceeds cash in.", reason=f"The normalized deficit is {deficit_pct:.1f}% of cash in.", risks=["Funding pressure and delayed obligations."], decision="Approve an immediate cash-recovery and payment-prioritization plan.", mitigation=["Accelerate certified billing and collection."])
    elif net is not None and net < 0:
        result.update(status="caution", indication="The cumulative cash position contains a deficit.", reason="Cash out exceeds cash in.", risks=["The deficit can become a material funding gap."], decision="Review collection timing and commitments weekly.")
    else:
        result.update(status="favorable", indication="Reported cash recovery covers reported expenditure.", reason="Net cash is non-negative on the available source timeline.", benefits=["Lower immediate funding pressure."], decision="Maintain collection discipline.", keepOnTrack=["Monitor the next three-month payment and billing forecast."])
    return result


def concentration(data: dict[str, Any], norm: dict[str, Any], policy: Policy) -> dict[str, Any]:
    values: dict[str, float] = {}
    for item in rows(norm.get("boq_resources")):
        name = str(item.get("resource") or item.get("resource_code") or "Other")
        amount = finite(item.get("actual_cost"))
        if amount is not None:
            values[name] = values.get(name, 0.0) + amount
    total = sum(values.values()) if values else None
    top = max(values.values()) if values else None
    share = abs(top) / abs(total) * 100 if top is not None and total else None
    result = result_base(data, "resource-concentration", "Direct Resource Cost Pareto", "resources", "chart", {"driverCount": float(len(values)), "total": total, "top": top, "topSharePct": share})
    if share is None:
        return unavailable(result, "A valid leading resource and total are not both available.")
    result["meaning"] = "Measures how much cost is concentrated in the leading resource."
    result["thresholds"] = {"cautionPct": policy.concentration_caution_pct, "criticalPct": policy.concentration_critical_pct}
    result["ruleApplied"] = "Largest driver / analyzed total"
    if share > policy.concentration_critical_pct:
        result.update(status="critical", indication="Cost exposure is highly concentrated.", reason=f"The leading driver represents {share:.1f}% of the analyzed total.", risks=["One resource can dominate project outcome."], decision="Apply dedicated forecast and productivity controls to the leading driver.", mitigation=["Validate quantity, rate, commitment, and remaining exposure."])
    elif share > policy.concentration_caution_pct:
        result.update(status="caution", indication="The leading driver deserves focused monitoring.", reason=f"Its share is {share:.1f}%.", decision="Track the leading driver as a management exception.")
    else:
        result.update(status="favorable", indication="No single driver breaches the concentration threshold.", reason=f"The top share is {share:.1f}%.", benefits=["Cost exposure is less dependent on one recorded driver."], decision="Maintain ranked Pareto review.")
    return result


def data_quality(data: dict[str, Any], norm: dict[str, Any], _policy: Policy) -> dict[str, Any]:
    findings = rows(norm.get("data_quality")) + rows(data.get("quality"))
    severe = sum(1 for item in findings if str(item.get("severity", "")).lower() in {"critical", "error"})
    warnings = sum(1 for item in findings if str(item.get("severity", "")).lower() == "warning")
    unaccounted = finite((data.get("manifest") or {}).get("unaccounted_sheets")) or 0
    result = result_base(data, "data-quality", "Data Quality and Coverage", "assurance", "assurance", {"findings": float(len(findings)), "severe": float(severe), "warnings": float(warnings), "unaccountedSheets": unaccounted})
    result["assessmentBasis"] = "evidence"
    result["meaning"] = "Tests whether source coverage and parser findings support management reliance."
    result["ruleApplied"] = "Quality severity and source-coverage guard"
    if severe or unaccounted:
        result.update(status="critical", indication="Critical quality or coverage issues require resolution.", reason=f"{severe} severe finding(s); {int(unaccounted)} unaccounted sheet(s).", risks=["Decisions may rely on incomplete or contradictory evidence."], decision="Resolve critical findings before approving affected conclusions.", mitigation=["Trace each issue to its source sheet or cell."])
    elif warnings:
        result.update(status="caution", indication="The dataset is usable with explicit warnings.", reason=f"{warnings} warning finding(s) remain.", decision="Proceed only with the stated limitations.")
    else:
        result.update(status="favorable", indication="No critical parser-level quality signal is present.", reason="Severe findings and unaccounted sheets are zero.", benefits=["The reviewed scope has stronger auditability."], decision="Maintain lineage and repeat validation on every update.")
    return result


ANALYZERS: tuple[Callable[[dict[str, Any], dict[str, Any], Policy], dict[str, Any]], ...] = (
    cost_performance,
    profitability,
    cashflow,
    concentration,
    data_quality,
)


def normalized_path(data: dict[str, Any]) -> Path | None:
    value = data.get("normalized_path")
    if not isinstance(value, str) or not value:
        return None
    path = ROOT / "public" / value.lstrip("/").replace("generated/", "generated/", 1)
    return path if path.is_file() else None


def analyze_project(registry: dict[str, Any], policy: Policy) -> dict[str, Any]:
    project_id = str(registry.get("project_id") or "")
    latest_path = GENERATED / "projects" / project_id / "latest.json"
    if not project_id or not latest_path.is_file():
        return {"projectId": project_id or None, "projectName": registry.get("project_name"), "status": "unavailable", "error": "Project latest JSON is missing.", "components": []}
    data = json.loads(latest_path.read_text(encoding="utf-8"))
    norm_path = normalized_path(data)
    norm = json.loads(norm_path.read_text(encoding="utf-8")) if norm_path else {}
    components = [analyzer(data, norm, policy) for analyzer in ANALYZERS]
    order = {"critical": 0, "caution": 1, "mixed": 2, "favorable": 3, "informational": 4, "unavailable": 5}
    components.sort(key=lambda item: (order.get(str(item.get("status")), 9), str(item.get("componentName"))))
    counts = {status: sum(1 for item in components if item.get("status") == status) for status in order}
    return {
        "projectId": data.get("project_id"),
        "projectName": data.get("project_name"),
        "period": data.get("reporting_period"),
        "revision": (data.get("source") or {}).get("sha256"),
        "summary": counts,
        "components": components,
    }


def run(project_id: str | None = None, policy: Policy | None = None) -> dict[str, Any]:
    policy = policy or Policy()
    registry_path = GENERATED / "projects.json"
    if not registry_path.is_file():
        raise FileNotFoundError(f"Project registry not found: {registry_path}")
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    if not isinstance(registry, list):
        raise ValueError("Project registry must contain a JSON array.")
    selected = [item for item in registry if isinstance(item, dict) and (not project_id or item.get("project_id") == project_id)]
    if project_id and not selected:
        raise ValueError(f"Project not found in current registry: {project_id}")
    projects = [analyze_project(item, policy) for item in selected]
    totals = {status: sum(project.get("summary", {}).get(status, 0) for project in projects) for status in ("critical", "caution", "mixed", "favorable", "informational", "unavailable")}
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRegistry": str(registry_path),
        "policy": asdict(policy),
        "projectCount": len(projects),
        "summary": totals,
        "projects": projects,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read current CTO CostControl JSON and produce standalone intelligence results.")
    parser.add_argument("--project", help="Analyze one current project ID; default analyzes every registered project.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help=f"Output JSON path (default: {DEFAULT_OUTPUT})")
    parser.add_argument("--stdout", action="store_true", help="Print JSON without writing an output file.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = run(args.project)
    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.stdout:
        print(encoded)
    else:
        output = args.output.resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(encoded, encoding="utf-8")
        print(f"LIVE READING: {payload['projectCount']} project(s)")
        print(f"OUTPUT: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
