export const PROJECT_FAMILIES = [
  {
    id: "executive",
    label: "Executive",
    pages: [
      { id: "executive-overview", label: "Cost Position" },
      { id: "executive-commercial", label: "Profit & Cashflow" },
      { id: "executive-resources", label: "Resources & Efficiency" },
    ],
  },
  {
    id: "forecast",
    label: "Forecast Engineering",
    pages: [
      { id: "forecast-performance", label: "WBS Performance" },
      { id: "forecast-boq-actual", label: "BOQ Actual Costs" },
      { id: "forecast-boq-outlook", label: "BOQ Forecast" },
    ],
  },
  {
    id: "structure",
    label: "Cost Structure",
    pages: [
      { id: "structure-direct", label: "Direct Costs" },
      { id: "structure-indirect", label: "Indirect Costs" },
      { id: "structure-allocation", label: "Allocations & Waste" },
    ],
  },
  {
    id: "ledger",
    label: "Ledger & Controls",
    pages: [
      { id: "ledger-analytics", label: "Ledger Analytics" },
      { id: "ledger-transactions", label: "Transactions" },
      { id: "ledger-codes", label: "Cost Code Register" },
    ],
  },
  {
    id: "assurance",
    label: "Source & Assurance",
    pages: [
      { id: "assurance-quality", label: "Data Quality" },
      { id: "assurance-workbooks", label: "Workbook Sources" },
      { id: "assurance-visuals", label: "Source Visuals" },
    ],
  },
] as const;

export type ProjectView = (typeof PROJECT_FAMILIES)[number]["pages"][number]["id"];

export const DEFAULT_PROJECT_VIEW: ProjectView = "executive-overview";

const ALL_VIEWS = new Set<string>(PROJECT_FAMILIES.flatMap((family) => family.pages.map((page) => page.id)));
const LEGACY_DEFAULTS: Record<string, ProjectView> = {
  executive: "executive-overview",
  forecast: "forecast-performance",
  ledger: "ledger-analytics",
  audit: "assurance-quality",
};

export function normalizeProjectView(value?: string): ProjectView {
  if (value && ALL_VIEWS.has(value)) return value as ProjectView;
  return (value && LEGACY_DEFAULTS[value]) || DEFAULT_PROJECT_VIEW;
}

export function familyForView(view: ProjectView) {
  return PROJECT_FAMILIES.find((family) => family.pages.some((page) => page.id === view)) || PROJECT_FAMILIES[0];
}
