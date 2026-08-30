import unittest
from unittest.mock import patch

from watcher.xlsx_engine import (
    _extract_boq_resources,
    _extract_cashflow,
    _extract_direct_details,
    _extract_indirect_breakdowns,
    _extract_waste,
    _schema_header,
    build_adaptive_normalized,
)


def sheet(name, values):
    cells = [
        {"row": row, "col": col, "ref": f"R{row}C{col}", "value": value}
        for row, col, value in values
    ]
    return {
        "name": name,
        "state": "visible",
        "dimension": None,
        "cell_count": len(cells),
        "cells": cells,
        "charts": [],
    }


class AdaptiveExtractorSafetyTests(unittest.TestCase):
    def test_one_source_column_cannot_map_to_multiple_fields(self):
        source = sheet("Detail", [(1, 1, "Actual Cost")])
        _, mapping, _ = _schema_header(
            source,
            {"actual_cost": ["actual cost"], "ac": ["actual cost"]},
        )
        self.assertEqual(len(mapping), 1)
        self.assertEqual(len(set(mapping.values())), len(mapping))

    def test_cashflow_preserves_legitimate_zero_and_provenance(self):
        source = sheet(
            "Cash Flow Renamed",
            [
                (1, 2, "2026-01"), (1, 3, "2026-02"),
                (2, 1, "Cash In"), (2, 2, 100), (2, 3, 200),
                (3, 1, "Cash Out"), (3, 2, 0), (3, 3, 50),
            ],
        )
        rows, learning = _extract_cashflow([source])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["cash_out"], 0.0)
        self.assertEqual(rows[0]["cash_out_source_state"], "value")
        self.assertEqual(rows[0]["source_sheet"], "Cash Flow Renamed")
        self.assertEqual(learning["confidence"], 0.95)

    def test_direct_details_accepts_reordered_columns_and_renamed_sheet(self):
        source = sheet(
            "Commercial Work Packages",
            [
                (1, 1, "Description"), (1, 2, "EAC"), (1, 3, "Main Code"),
                (1, 4, "Actual Cost"), (1, 5, "Original Budget"), (1, 6, "Earned Value"),
                (1, 7, "BAC"), (1, 8, "ETC"), (1, 9, "Division Name"),
                (2, 1, "Foundation"), (2, 2, 120), (2, 3, "A.1"),
                (2, 4, 80), (2, 5, 100), (2, 6, 90),
                (2, 7, 100), (2, 8, 40), (2, 9, "Civil"),
            ],
        )
        rows, learning = _extract_direct_details([source])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["main_code"], "A.1")
        self.assertEqual(rows[0]["ac"], 80.0)
        self.assertEqual(rows[0]["source_sheet"], "Commercial Work Packages")
        self.assertGreaterEqual(learning["confidence"], 0.25)

    def test_formula_error_can_use_same_month_ledger_but_zero_cannot(self):
        source = sheet(
            "Cashflow",
            [
                (1, 2, "2026-01"), (1, 3, "2026-02"),
                (2, 1, "Cash In"), (2, 2, 100), (2, 3, 200),
                (3, 1, "Cash Out"), (3, 2, 0), (3, 3, "#NAME?"),
            ],
        )
        ledger = {
            "expense_months": ["2026-01", "2026-02"],
            "expenses_packed": [],
            "ledger_months": [
                {"month": "2026-01", "total": 75.0},
                {"month": "2026-02", "total": 125.0},
            ],
            "ledger_aggregates": {"by_code": [], "by_source": []},
            "raw_direct": None,
            "raw_indirect": None,
            "accounting_total": 200.0,
        }
        with patch("watcher.xlsx_engine._extract_ledger", return_value=(ledger, {"role": "ledger", "confidence": 1.0})):
            normalized = build_adaptive_normalized({}, {}, [source])
        self.assertEqual(normalized["cashflow"][0]["cash_out"], 0.0)
        self.assertNotIn("cash_out_fallback", normalized["cashflow"][0])
        self.assertEqual(normalized["cashflow"][1]["cash_out"], 125.0)
        self.assertEqual(normalized["cashflow"][1]["cash_out_fallback"], "same_month_transaction_ledger")
        self.assertIsNone(normalized["kpis"]["actual_cost_total_project_scope"])
        self.assertEqual(normalized["kpis"]["ledger_accounting_cost"], 200.0)
        self.assertEqual(normalized["cost_scope_reconciliation"]["ledger_actual"], 200.0)
        self.assertFalse(normalized["cost_scope_reconciliation"]["forced_reconciliation"])

    def test_boq_requires_verified_wbs_code(self):
        source = sheet(
            "Resource Sheet",
            [
                (1, 1, "B.1"),
                (2, 1, "Resource"), (2, 2, "Resource Code"),
                (2, 3, "Actual Cost"), (2, 4, "Work Performed Qty"),
                (3, 1, "Labor"), (3, 2, "L-01"), (3, 3, 100), (3, 4, 10),
            ],
        )
        direct = [{"main_code": "A.1", "description": "Verified work package"}]
        resources, forecasts, learning = _extract_boq_resources([source], direct)
        self.assertEqual(resources, [])
        self.assertEqual(len(forecasts), 1)
        self.assertEqual(learning["learned_sheets"], 0)

    def test_waste_without_explicit_material_headers_is_unavailable(self):
        source = sheet(
            "Waste",
            [
                (3, 2, "Material A"), (3, 3, "Material B"),
                (5, 1, "إجمالي الاستهلاك الفعلي"), (5, 2, 10), (5, 3, 20),
                (6, 1, "إجمالي الاستهلاك الهندسي"), (6, 2, 9), (6, 3, 18),
                (7, 1, "وحدة البند"), (7, 2, "t"), (7, 3, "m3"),
                (8, 1, "تشوين"), (8, 2, 0), (8, 3, 0),
                (9, 1, "الكميه المدرجه"), (9, 2, 9), (9, 3, 18),
                (10, 1, "Actual Waste Quantity"), (10, 2, 1), (10, 3, 2),
            ],
        )
        waste, detail, learning = _extract_waste([source])
        self.assertEqual(waste, [])
        self.assertEqual(detail, [])
        self.assertEqual(learning["confidence"], 0.0)

    def test_indirect_pool_requires_explicit_cost_header(self):
        source = sheet(
            "Indirect Breakdown",
            [
                (1, 1, "Total Indirect Cost"),
                (2, 1, "Category A"), (2, 2, 10),
                (3, 1, "Category B"), (3, 2, 20),
                (4, 1, "Category C"), (4, 2, 30),
            ],
        )
        granular, official, learning = _extract_indirect_breakdowns([source])
        self.assertEqual(granular, [])
        self.assertEqual(official, [])
        self.assertEqual(learning["confidence"], 0.0)


if __name__ == "__main__":
    unittest.main()
