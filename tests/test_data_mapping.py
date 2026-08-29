from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class DataMappingContractTests(unittest.TestCase):
    def test_project_mapping_is_a_source_assurance_page(self):
        views = (ROOT / "src/lib/projectViews.ts").read_text(encoding="utf-8")
        workspace = (ROOT / "src/components/ProjectWorkspace.tsx").read_text(encoding="utf-8")
        self.assertIn('{ id: "assurance-mapping", label: "Data Mapping" }', views)
        self.assertIn('view==="assurance-mapping"', workspace)
        self.assertIn("<ProjectDataMapping", workspace)

    def test_mapping_uses_generated_lineage_and_has_adaptive_fallback(self):
        mapping = (ROOT / "src/lib/dataMapping.ts").read_text(encoding="utf-8")
        for field in ("source_sheet", "source_row", "source_cell", "mapping_confidence", "normalized_path"):
            self.assertIn(field, mapping)
        self.assertIn("Object.entries(normalized||{})", mapping)
        self.assertIn("Adaptive normalized dataset retained", mapping)
        self.assertNotIn("Gloria", mapping)
        self.assertNotIn("THE BIG", mapping)

    def test_portfolio_data_quality_contains_mapping_tab(self):
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        mapping = (ROOT / "src/lib/dataMapping.ts").read_text(encoding="utf-8")
        self.assertIn("Quality Overview", dashboard)
        self.assertIn("Data Mapping", dashboard)
        self.assertIn("<PortfolioDataMapping", dashboard)
        for output in ("Portfolio Cost Position", "CTO Technical Cost Matrix", "CTO Monthly Cost Comparison", "Portfolio Risk"):
            self.assertIn(output, mapping)

    def test_mapping_never_invents_missing_evidence(self):
        component = (ROOT / "src/components/DataMapping.tsx").read_text(encoding="utf-8")
        self.assertIn("Exact workbook row/cell evidence is not available", component)
        self.assertIn("no workbook address or financial value is fabricated", component)


if __name__ == "__main__":
    unittest.main()

