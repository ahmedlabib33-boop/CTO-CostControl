import type { NormalizedData, PortfolioModel, ProjectRegistryItem } from "@/lib/types";

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const firstNum = (...vals: unknown[]) => vals.find(isNum) as number | undefined;
export const money = (v?: number | null, digits = 1) => v == null || !Number.isFinite(v)
  ? "—"
  : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, notation: Math.abs(v) >= 1_000_000 ? "compact" : "standard" }).format(v);
export const moneyFull = (v?: number | null) => v == null || !Number.isFinite(v)
  ? "—"
  : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
export const pct = (v?: number | null, inputIsRatio = false) => v == null || !Number.isFinite(v) ? "—" : `${(inputIsRatio ? v * 100 : v).toFixed(1)}%`;
export const num = (v?: number | null, digits = 2) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);
export const text = (v: unknown) => v == null || v === "" ? "—" : String(v);
export const sourceMetric = (n: NormalizedData | null, key: string, fallback?: number) => firstNum(n?.kpis?.[key], fallback);

export type PortfolioValues = {
  id: string; name: string; projectName: string; period: string;
  contract: number; price: number; budget: number; directBudget: number; indirectBudget: number;
  evDashboard: number; evTotal: number; acDashboard: number; acTotal: number;
  directAc: number; indirectAc: number; ledger: number; revenue: number; gp: number; gpPct: number; deductions: number;
  cashflow: any[]; projectItems: any[]; normalized: NormalizedData | null; registry: ProjectRegistryItem;
};

export function portfolioBase(model: PortfolioModel): PortfolioValues {
  const r = model.registry, n = model.normalized, m = r.metrics || {}, k = n?.kpis || {};
  const profitability = Array.isArray(n?.profitability) ? n!.profitability : [];
  const revenueMethod = profitability.find((x:any) => String(x?.method||"").toLowerCase().includes("revenue")) || profitability[0];
  return {
    id: r.project_id,
    name: r.project_name,
    projectName: n?.meta?.project_name || r.project_name,
    period: r.reporting_period,
    contract: firstNum(k.contract_price_dashboard, m.contract_value) || 0,
    price: firstNum(k.total_price_project_summary, k.contract_price_dashboard, m.contract_value) || 0,
    budget: firstNum(k.total_budget_cost, m.budget) || 0,
    directBudget: firstNum(k.direct_budget_cost) || 0,
    indirectBudget: firstNum(k.indirect_budget_cost) || 0,
    evDashboard: firstNum(k.ev_dashboard_scope, m.earned_value) || 0,
    evTotal: firstNum(k.ev_total_project_scope, k.ev_dashboard_scope, m.earned_value) || 0,
    acDashboard: firstNum(k.actual_cost_dashboard_scope, m.actual_cost) || 0,
    acTotal: firstNum(k.actual_cost_total_project_scope, k.actual_cost_dashboard_scope, m.actual_cost) || 0,
    directAc: firstNum(k.direct_actual, m.direct_cost) || 0,
    indirectAc: firstNum(k.indirect_actual, m.indirect_cost) || 0,
    ledger: firstNum(k.ledger_accounting_cost) || 0,
    revenue: firstNum(k.revenue_gross_profit, revenueMethod?.base, m.revenue) || 0,
    gp: firstNum(revenueMethod?.profit, m.gross_profit) || 0,
    gpPct: firstNum(revenueMethod?.profit_pct) || 0,
    deductions: firstNum(revenueMethod?.deductions) || 0,
    cashflow: Array.isArray(n?.cashflow) ? n!.cashflow : [],
    projectItems: Array.isArray(n?.project_items) ? n!.project_items : [],
    normalized: n,
    registry: r,
  };
}

export function scoped(v: PortfolioValues, scope: "dashboard" | "total") {
  const ev = scope === "total" ? v.evTotal : v.evDashboard;
  const ac = scope === "total" ? v.acTotal : v.acDashboard;
  return { ...v, ev, ac, cv: ev - ac, cpi: ac ? ev / ac : null, indirectVar: v.indirectBudget - v.indirectAc };
}

export function unpackExpenses(n: NormalizedData | null) {
  if (!n) return [] as any[];
  if (Array.isArray(n.expenses)) return n.expenses;
  const months = Array.isArray(n.expense_months) ? n.expense_months : [];
  if (!Array.isArray(n.expenses_packed)) return [] as any[];
  return n.expenses_packed.map((r:any[]) => {
    const detail = months.map((m:string) => ({ month:m, qty:null as number|null, unit_price:null as number|null, total:0 }));
    (r[10] || []).forEach((x:any[]) => { if (detail[x[0]]) { detail[x[0]].qty=x[1]; detail[x[0]].unit_price=x[2]; detail[x[0]].total=x[3]; } });
    return { sn:r[0], main_code:r[1], resource_code:r[2], extra_description:r[3], di:r[4], source:r[5], item:r[6], description:r[7], unit:r[8], currency:r[9], months:detail, total_qty:r[11], avg_unit_price:r[12], currency_factor:r[13], total_cost:r[14], source_evidence:r[15] || null };
  });
}

export function aggregate<T>(rows:T[], label:(r:T)=>string, value:(r:T)=>number, limit?:number) {
  const m = new Map<string,number>();
  rows.forEach(r => { const k = label(r) || "Other"; const v = value(r); if (Number.isFinite(v)) m.set(k,(m.get(k)||0)+v); });
  const out = [...m.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  return limit ? out.slice(0,limit) : out;
}
