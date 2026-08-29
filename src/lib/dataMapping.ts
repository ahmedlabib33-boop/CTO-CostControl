import type { NormalizedData, PortfolioModel, ProjectData } from "@/lib/types";

export type MappingStatus = "wired" | "derived" | "unavailable" | "adaptive";

export type DataMappingRow = {
  id: string;
  scope: "project" | "portfolio";
  projectId: string;
  projectName: string;
  period: string;
  outputFamily: string;
  outputPage: string;
  outputComponent: string;
  outputField: string;
  jsonPaths: string[];
  sourceFile: string;
  inputLocations: string[];
  sourceRecords: number;
  confidence: number | null;
  status: MappingStatus;
  transform: string;
  currentValue: string;
};

type ProjectBinding = {
  family: string;
  page: string;
  component: string;
  field?: string;
  metric?: string;
  datasets?: string[];
  json?: string[];
  transform?: string;
};

const P = (family:string,page:string,component:string,metric?:string,datasets:string[]=[],transform="Direct normalized value"):ProjectBinding => ({family,page,component,metric,datasets,transform});

// This is an output contract, not a workbook template. Workbook locations always
// come from the generated evidence attached to the current project JSON.
export const PROJECT_OUTPUT_BINDINGS: ProjectBinding[] = [
  P("Executive","Cost Position","Contract Price","contract_value",[],"Selected authoritative metric candidate"),
  P("Executive","Cost Position","Total Budget Cost","budget",[],"Selected authoritative metric candidate"),
  P("Executive","Cost Position","Earned Value","earned_value",["project_items"],"Dashboard-scope EV; detail remains in project_items"),
  P("Executive","Cost Position","Actual Cost","actual_cost",["project_items"],"Dashboard-scope AC; detail remains in project_items"),
  P("Executive","Cost Position","Cost Variance","cost_variance",["project_items"],"Earned Value minus Actual Cost"),
  P("Executive","Cost Position","CPI","cpi",["project_items"],"Earned Value divided by Actual Cost"),
  P("Executive","Cost Position","Direct Actual","direct_cost",["direct_details"],"Direct cost scope"),
  P("Executive","Cost Position","Indirect Actual","indirect_cost",["indirect_details"],"Indirect cost scope"),
  P("Executive","Cost Position","Revenue","revenue",["profitability"],"Revenue-based source method"),
  P("Executive","Cost Position","Ledger Cost",undefined,["ledger_months"],"Accounting ledger total; kept separate from dashboard AC"),
  P("Executive","Cost Position","Budget vs Earned Value vs Actual Cost — by division",undefined,["project_items"],"Group project items by division"),
  P("Executive","Cost Position","Cost Performance Map",undefined,["project_items"],"Budget bubble, completion X-axis, CPI Y-axis"),
  P("Executive","Profit & Cashflow","Profitability",undefined,["profitability"],"Keep workbook profit methods separate"),
  P("Executive","Profit & Cashflow","Monthly Cashflow — Cash In vs Cash Out",undefined,["cashflow"],"Monthly source series"),
  P("Executive","Profit & Cashflow","Cumulative Cashflow / S-Curve",undefined,["cashflow"],"Cumulative source series"),
  P("Executive","Resources & Efficiency","Resource Cost Concentration",undefined,["boq_resources"],"Aggregate actual cost by resource"),
  P("Executive","Resources & Efficiency","Waste and Material Efficiency",undefined,["waste","waste_detail"],"Source waste quantities, budget and variance"),
  P("Executive","Resources & Efficiency","Cost Classification Bridge",undefined,["direct_alloc","reallocation"],"Direct allocation and reallocation evidence"),
  P("Forecast Engineering","WBS Performance","Project Summary / WBS",undefined,["project_items"],"All normalized work-package rows"),
  P("Forecast Engineering","WBS Performance","Project Summary group / total rows",undefined,["project_totals"],"Retained source summary rows"),
  P("Forecast Engineering","BOQ Actual Costs","Detailed BOQ Resource Explorer",undefined,["boq_resources"],"Resource-level actual cost"),
  P("Forecast Engineering","BOQ Forecast","Detailed BOQ Forecast Analysis",undefined,["boq_forecasts"],"Rates, remaining quantity, EV, BAC and ETC"),
  P("Cost Structure","Direct Costs","Direct Details",undefined,["direct_details"],"Direct commercial and earned-value rows"),
  P("Cost Structure","Indirect Costs","Indirect Cost Detail",undefined,["indirect_details"],"Indirect budget, EV, AC and forecast rows"),
  P("Cost Structure","Indirect Costs","Indirect cost pools — granular vs official",undefined,["indirect_granular","indirect_official"],"Keep source classifications separate"),
  P("Cost Structure","Allocations & Waste","Indirect-Direct Breakdown",undefined,["direct_alloc","reallocation"],"Allocation and reallocation records"),
  P("Cost Structure","Allocations & Waste","Waste Report",undefined,["waste","waste_detail"],"Complete source waste records"),
  P("Ledger & Controls","Ledger Analytics","Actual Expense Trend",undefined,["ledger_months"],"Monthly accounting ledger totals"),
  P("Ledger & Controls","Ledger Analytics","Expense Source Mix",undefined,["ledger_aggregates"],"Group full ledger by source"),
  P("Ledger & Controls","Ledger Analytics","Top Cost Codes",undefined,["ledger_aggregates"],"Group full ledger by main code"),
  P("Ledger & Controls","Ledger Analytics","Ledger Reconciliation",undefined,["cost_scope_reconciliation","ledger_months"],"Compare scopes without overwriting either value"),
  P("Ledger & Controls","Transactions","Expense Transactions",undefined,["expenses_packed","expense_months"],"Decode packed full ledger and monthly detail"),
  P("Ledger & Controls","Cost Code Register","Cost Code Lookup",undefined,["cost_codes"],"Controlled searchable lookup"),
  P("Source & Assurance","Data Quality","Data Quality",undefined,["data_quality"],"Parser and source findings"),
  P("Source & Assurance","Data Quality","Source Lineage",undefined,["meta","source_inventory"],"Project identity, period, fingerprint and source manifest"),
  P("Source & Assurance","Workbook Sources","Workbook Sources and Detected Tables",undefined,["source_inventory","source_snapshots"],"Retained source workbook structures"),
  P("Source & Assurance","Source Visuals","Workbook Charts and Source Media",undefined,["source_charts","source_media"],"Retained source chart/media evidence"),
];

const PORTFOLIO_OUTPUTS: ProjectBinding[] = [
  P("Portfolio Command Center","Headline Position","Selected Projects",undefined,[],"Count active project records"),
  P("Portfolio Command Center","Headline Position","Contract Price","contract_value",[],"Sum current project contract values"),
  P("Portfolio Command Center","Headline Position","Budget","budget",[],"Sum current project budget values"),
  P("Portfolio Command Center","Headline Position","Earned Value","earned_value",[],"Sum current project EV on selected scope"),
  P("Portfolio Command Center","Headline Position","Actual Cost","actual_cost",[],"Sum current project AC on selected scope"),
  P("Portfolio Command Center","Headline Position","Portfolio CPI",undefined,["project_items"],"Portfolio EV divided by portfolio AC"),
  P("Portfolio Command Center","Headline Position","Cost Variance","cost_variance",[],"Portfolio EV minus portfolio AC"),
  P("Portfolio Command Center","Headline Position","Revenue","revenue",[],"Sum project revenue values"),
  P("Portfolio Command Center","Headline Position","Gross Profit","gross_profit",[],"Sum revenue-based project gross profit"),
  P("Portfolio Command Center","Headline Position","Indirect Variance",undefined,["indirect_details"],"Sum project indirect budget variance"),
  P("Portfolio Command Center","Charts","Portfolio Cost Position",undefined,["project_items"],"Compare project Budget, EV and AC"),
  P("Portfolio Command Center","Charts","Margin vs Cost Performance",undefined,["profitability","project_items"],"Project CPI, gross-profit percentage and contract size"),
  P("Portfolio Command Center","Charts","Direct vs Indirect Actual Cost",undefined,["direct_details","indirect_details"],"Compare project cost scopes"),
  P("Portfolio Command Center","Charts","Revenue, Actual Cost & Gross Profit",undefined,["profitability","project_items"],"Compare commercial and cost values"),
  P("Portfolio Command Center","Charts","Portfolio Cashflow Comparison",undefined,["cashflow"],"Align project source months without mixing projects"),
  P("Portfolio Command Center","CTO Analysis","CTO Technical Cost Matrix",undefined,["project_items","profitability"],"One project row per selected project"),
  P("Portfolio Command Center","CTO Analysis","CTO Monthly Cost Comparison",undefined,["cashflow"],"Compare common or all project source months"),
  P("Portfolio Command Center","CTO Analysis","CTO Cost Scenario Lab",undefined,["project_items","profitability"],"Reversible user what-if applied to current project inputs"),
  P("Portfolio Command Center","Risk","Portfolio Risk",undefined,["project_items","profitability","cashflow","cost_scope_reconciliation","data_quality"],"Deterministic rules evaluate project inputs before portfolio summary"),
];

function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase())}
function finite(value:unknown):value is number{return typeof value==="number"&&Number.isFinite(value)}
function display(value:unknown){if(finite(value))return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(value);if(value==null||value==="")return "—";return String(value)}

function recordsFor(value:any):any[]{
  if(Array.isArray(value)) return value;
  if(value&&typeof value==="object") return Object.values(value).flatMap(recordsFor);
  return [];
}

function evidenceFrom(records:any[]){
  const locations=new Set<string>();let weighted=0,scores=0;
  records.forEach(raw=>{
    const row=Array.isArray(raw)&&raw.length&&typeof raw.at(-1)==="object"?raw.at(-1):raw;
    if(!row||typeof row!=="object")return;
    const sheet=row.source_sheet||row.sheet;
    const sourceRow=row.source_row||row.row;
    if(sheet)locations.add(sourceRow?`${sheet} · row ${sourceRow}`:String(sheet));
    if(finite(row.mapping_confidence)){weighted+=row.mapping_confidence;scores++}
  });
  return {locations:[...locations].slice(0,12),confidence:scores?weighted/scores:null};
}

function metricEvidence(data:ProjectData,key?:string){
  if(!key)return null;const block=data.metrics?.[key] as any;const preferred=block?.preferred;
  if(!preferred)return null;
  // Candidate score ranks possible cells; it is not a 0..1 extraction confidence.
  return {value:preferred.value,locations:[`${preferred.source_sheet} · ${preferred.source_cell}`],confidence:null};
}

export function buildProjectDataMappings(data:ProjectData,normalized:NormalizedData):DataMappingRow[]{
  const base=`/generated/projects/${data.project_id}/latest.json`;
  const normalizedPath=data.normalized_path||`${base}#/normalized_path`;
  const covered=new Set(PROJECT_OUTPUT_BINDINGS.flatMap(binding=>binding.datasets||[]));
  const rows:DataMappingRow[]=PROJECT_OUTPUT_BINDINGS.map((binding,index)=>{
    const metric=metricEvidence(data,binding.metric);
    const dataRecords=(binding.datasets||[]).flatMap(key=>recordsFor(normalized?.[key]));
    const evidence=evidenceFrom(dataRecords);
    const locations=[...(metric?.locations||[]),...evidence.locations].filter((v,i,a)=>a.indexOf(v)===i);
    const present=Boolean(metric)||dataRecords.length>0||(binding.datasets||[]).some(key=>normalized?.[key]!=null);
    const jsonPaths=[...(binding.metric?[`${base}#/metrics/${binding.metric}/preferred`]:[]),...(binding.datasets||[]).map(key=>`${normalizedPath}#/${key}`)];
    const status:MappingStatus=present?(locations.length?"wired":"derived"):"unavailable";
    return {id:`project-${index}-${binding.component}`,scope:"project" as const,projectId:data.project_id,projectName:data.project_name,period:data.reporting_period,outputFamily:binding.family,outputPage:binding.page,outputComponent:binding.component,outputField:binding.field||binding.component,jsonPaths,sourceFile:data.source.filename,inputLocations:locations,sourceRecords:dataRecords.length,confidence:metric?.confidence??evidence.confidence,status,transform:binding.transform||"Direct normalized value",currentValue:metric?display(metric.value):(dataRecords.length?`${dataRecords.length.toLocaleString()} records`:present?"Available":"Unavailable")};
  });
  Object.entries(normalized||{}).forEach(([key,value])=>{
    if(covered.has(key)||["normalization_mode","counts"].includes(key)||value==null)return;
    const records=recordsFor(value);if(!records.length&&typeof value!=="object")return;
    const evidence=evidenceFrom(records);
    rows.push({id:`adaptive-${key}`,scope:"project",projectId:data.project_id,projectName:data.project_name,period:data.reporting_period,outputFamily:"Source & Assurance",outputPage:"Data Mapping",outputComponent:`Adaptive dataset · ${humanize(key)}`,outputField:humanize(key),jsonPaths:[`${normalizedPath}#/${key}`],sourceFile:data.source.filename,inputLocations:evidence.locations,sourceRecords:records.length,confidence:evidence.confidence,status:evidence.locations.length?"adaptive":"derived",transform:"Adaptive normalized dataset retained for current and future output use",currentValue:records.length?`${records.length.toLocaleString()} records`:"Structured object"});
  });
  return rows;
}

function normalizedValue(model:PortfolioModel,binding:ProjectBinding){
  const r=model.registry,metric=binding.metric?r.metrics?.[binding.metric]:undefined;
  if(finite(metric))return metric;
  const k=model.normalized?.kpis||{};
  const aliases:Record<string,string[]>={contract_value:["contract_price_dashboard"],budget:["total_budget_cost"],earned_value:["ev_dashboard_scope","ev_total_project_scope"],actual_cost:["actual_cost_dashboard_scope","actual_cost_total_project_scope"],cost_variance:["derived_cv"],revenue:["revenue_gross_profit"],gross_profit:["gross_profit_revenue"]};
  for(const key of aliases[binding.metric||""]||[])if(finite(k[key]))return k[key];
  return undefined;
}

export function buildPortfolioDataMappings(models:PortfolioModel[]):DataMappingRow[]{
  return PORTFOLIO_OUTPUTS.flatMap((binding,outputIndex)=>models.map((model,projectIndex)=>{
    const r=model.registry;const value=normalizedValue(model,binding);
    const projectBase=`/generated/projects/${r.project_id}/latest.json`;
    const normalizedPath=r.normalized_path||`${projectBase}#/normalized_path`;
    const inputs=[...(binding.metric?[`${projectBase}#/metrics/${binding.metric}`]:[]),...(binding.datasets||[]).map(key=>`${normalizedPath}#/${key}`)];
    const records=(binding.datasets||[]).flatMap(key=>recordsFor(model.normalized?.[key]));
    const available=binding.component==="Selected Projects"||finite(value)||records.length>0||(binding.datasets||[]).some(key=>model.normalized?.[key]!=null);
    return {id:`portfolio-${outputIndex}-${projectIndex}`,scope:"portfolio",projectId:r.project_id,projectName:r.project_name,period:r.reporting_period,outputFamily:binding.family,outputPage:binding.page,outputComponent:binding.component,outputField:`${r.project_name} contribution`,jsonPaths:["/generated/portfolio/latest.json#/projects",...inputs],sourceFile:"Project JSON",inputLocations:inputs,sourceRecords:records.length,confidence:null,status:available?"derived":"unavailable",transform:binding.transform||"Portfolio aggregation",currentValue:finite(value)?display(value):binding.component==="Selected Projects"?"Included":records.length?`${records.length.toLocaleString()} records`:available?"Available":"Unavailable"};
  }));
}

