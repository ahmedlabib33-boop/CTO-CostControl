export type OllaVisualSpec =
  | { kind: "series"; title: string; labels: string[]; series: { label: string; values: number[]; tone: "gold" | "good" | "bad" | "muted" }[]; footer?: string }
  | { kind: "bars"; title: string; rows: { label: string; value: number; secondary?: number; tone?: "gold" | "good" | "bad" | "muted" }[]; footer?: string }
  | { kind: "quadrant"; title: string; xLabel: string; yLabel: string; zones: { label: string; size: "s" | "m" | "l"; status: "good" | "warn" | "bad" | "neutral" }[]; footer?: string }
  | { kind: "donut"; title: string; slices: { label: string; value: number }[]; center?: string; footer?: string }
  | { kind: "matrix"; title: string; headers: string[]; rows: string[][]; footer?: string }
  | { kind: "bridge"; title: string; nodes: string[]; footer?: string }
  | { kind: "metric"; title: string; items: { metric: string; formula?: string; meaning: string; direction?: string }[]; footer?: string }
  | { kind: "scenario"; title: string; before: { label: string; value: string }[]; after: { label: string; value: string; status?: "good" | "warn" | "bad" }[]; chain: string[]; footer?: string }
  | { kind: "flow"; title: string; nodes: string[]; footer?: string }
  | { kind: "noData"; title: string; message: string; footer?: string };

const months = ["M1","M2","M3","M4","M5","M6"];

export const CEO_VISUALS: Record<string, OllaVisualSpec> = {
  "M3-Q01": { kind:"series", title:"Portfolio Cost Position — illustration", labels:months, series:[
    {label:"Budget",values:[20,38,58,76,90,100],tone:"muted"},
    {label:"EV",values:[18,34,50,67,80,88],tone:"good"},
    {label:"AC",values:[17,31,47,65,84,96],tone:"bad"}
  ], footer:"Illustrative only. Live project values are not hard-coded." },
  "M3-Q02": { kind:"quadrant", title:"Margin vs Cost Performance — executive quadrant", xLabel:"CPI →", yLabel:"Gross Profit % ↑", zones:[
    {label:"Strong",size:"m",status:"good"},{label:"Margin protects weak CPI",size:"l",status:"warn"},
    {label:"Efficient / weak commercial",size:"s",status:"neutral"},{label:"Danger",size:"l",status:"bad"}
  ], footer:"Bubble size represents financial materiality. No live X/Y project values are hard-coded." },
  "M3-Q03": { kind:"donut", title:"Direct vs Indirect Actual Cost", slices:[{label:"Direct AC",value:78},{label:"Indirect AC",value:22}], center:"AC Mix", footer:"Watch the ratio and its change over time." },
  "M3-Q04": { kind:"bars", title:"Revenue / Actual Cost / Gross Profit", rows:[
    {label:"Revenue",value:100,tone:"gold"},{label:"Actual Cost",value:84,tone:"bad"},{label:"Gross Profit",value:16,tone:"good"}
  ], footer:"The residual profit can collapse much faster than revenue changes." },
  "M3-Q05": { kind:"series", title:"Portfolio Cashflow Comparison", labels:months, series:[
    {label:"Cash In",values:[8,22,40,62,80,96],tone:"good"},{label:"Cash Out",values:[14,29,45,64,88,104],tone:"bad"}
  ], footer:"The gap is working-capital exposure." },
  "M3-Q06": { kind:"matrix", title:"CTO Technical Cost Matrix", headers:["Project","CPI","CV","Margin","Peer"], rows:[
    ["A","1.06","+","18%","Best"],["B","1.01","+","14%","Stable"],["C","0.82","−","7%","Outlier"],["D","0.96","−","11%","Watch"]
  ], footer:"Find the outlier first; diagnose the cause second." },
  "M3-Q07": { kind:"series", title:"CTO Monthly Cost Comparison", labels:months, series:[
    {label:"Project A",values:[16,30,47,58,74,86],tone:"gold"},{label:"Project B",values:[15,27,40,56,78,100],tone:"bad"}
  ], footer:"Compare the same months and the same metric basis." },
  "M3-Q08": { kind:"bars", title:"CTO Cost Scenario Lab", rows:[
    {label:"Base Margin",value:14,tone:"good"},{label:"Stress A",value:7,tone:"gold"},{label:"Stress B",value:2,tone:"bad"}
  ], footer:"Scenario visuals are illustrative, not live forecast values." },
  "M3-Q09": { kind:"bars", title:"Budget vs EV vs AC — by Division", rows:[
    {label:"Civil",value:74,secondary:70,tone:"good"},{label:"MEP",value:55,secondary:76,tone:"bad"},{label:"Finishes",value:44,secondary:42,tone:"good"}
  ], footer:"Primary bar = EV; secondary marker = AC." },
  "M3-Q10": { kind:"quadrant", title:"Cost Performance Map", xLabel:"% Completion →", yLabel:"CPI ↑", zones:[
    {label:"Early / recoverable",size:"m",status:"warn"},{label:"Late / healthy",size:"m",status:"good"},
    {label:"Early / weak CPI",size:"s",status:"warn"},{label:"Late + low CPI + large budget",size:"l",status:"bad"}
  ], footer:"No live X/Y package values are hard-coded." },
  "M3-Q11": { kind:"bars", title:"Profitability — three methods", rows:[
    {label:"Revenue-based GP",value:18,tone:"good"},{label:"GP / Net Profit",value:16,tone:"gold"},{label:"Planned GP",value:17,tone:"muted"}
  ], footer:"Keep different methods visibly separate." },
  "M3-Q12": { kind:"bars", title:"Monthly Cashflow — In vs Out", rows:[
    {label:"M1",value:30,secondary:25},{label:"M2",value:26,secondary:34,tone:"bad"},{label:"M3",value:42,secondary:38,tone:"good"},
    {label:"M4",value:31,secondary:45,tone:"bad"}
  ], footer:"Primary bar = Cash In; secondary marker = Cash Out." },
  "M3-Q13": { kind:"series", title:"Cumulative Cashflow / S-Curve", labels:months, series:[
    {label:"Cum. Cash In",values:[9,21,38,60,78,98],tone:"good"},{label:"Cum. Cash Out",values:[14,30,49,68,91,110],tone:"bad"}
  ], footer:"The vertical separation represents funding exposure." },
  "M3-Q14": { kind:"bars", title:"Direct Resource Cost Pareto", rows:[
    {label:"Subcontractor",value:32},{label:"Steel",value:24},{label:"Concrete",value:18},{label:"Equipment",value:11},{label:"Other",value:7}
  ], footer:"Focus management effort on the financially material few." },
  "M3-Q15": { kind:"bars", title:"Waste Efficiency", rows:[
    {label:"Steel",value:8,secondary:3,tone:"bad"},{label:"Concrete",value:5,secondary:2,tone:"bad"}
  ], footer:"Primary bar = Actual Waste %; secondary marker = Budget Waste %." },
  "M3-Q16": { kind:"bridge", title:"Accounting → Cost Control Bridge", nodes:["Accounting Ledger","Timing / Accrual","Classification","Cost-Control View","Unexplained Gap"], footer:"Every step should reconcile or be explicitly explained." },
  "M3-Q17": { kind:"series", title:"Actual Expense Trend — Source Ledger", labels:months, series:[
    {label:"Ledger AC",values:[18,23,21,46,27,31],tone:"gold"}
  ], footer:"A spike is a question, not a conclusion." },
  "M3-Q18": { kind:"donut", title:"Expense Source Mix", slices:[
    {label:"Mat",value:40},{label:"Subcontractor",value:30},{label:"Wages",value:15},{label:"Equ",value:10},{label:"Other",value:5}
  ], center:"Source Mix", footer:"Watch how the mix changes, not only the current split." },
  "M3-Q19": { kind:"bars", title:"Top Cost Codes by Actual Ledger Cost", rows:[
    {label:"Code 1001",value:100},{label:"Code 2003",value:76},{label:"Code 3002",value:55},{label:"Code 4005",value:31},{label:"Code 5001",value:18}
  ], footer:"Drill from code → transactions → cause → owner." },
  "M3-Q20": { kind:"matrix", title:"Ledger Reconciliation", headers:["Basis","Amount","Status"], rows:[
    ["Accounting","520.0M","Source"],["Cost Control","512.5M","Mapped"],["Gap","7.5M","Explain"]
  ], footer:"Non-zero can be valid; unexplained is the control issue." },
  "M3-Q21": { kind:"donut", title:"Total Actual Cost — composition", slices:[
    {label:"Mat",value:35},{label:"Subcontractor",value:28},{label:"Wages",value:14},{label:"Equipment",value:11},{label:"Other",value:12}
  ], center:"Total AC", footer:"Composition shows materiality, not automatically efficiency." },
  "M3-Q22": { kind:"bars", title:"Soil Settlement vs Other Indirect Cost", rows:[
    {label:"Soil Settlement",value:62,tone:"bad"},{label:"Other Indirect",value:38,tone:"muted"}
  ], footer:"Exceptional cost should not disappear inside the overhead pool." },
  "M3-Q23": { kind:"matrix", title:"General Comparison — source-defined series", headers:["Series","Definition","Status"], rows:[
    ["Series 1","Map from workbook","Required"],["Series 2","Map from workbook","Required"],["Series 3","Map from workbook","Required"],["Series 4","Map from workbook","Required"]
  ], footer:"Do not invent semantic labels for workbook cell-range series." },
  "M3-Q24": { kind:"series", title:"Actual Cost vs Revenue", labels:months, series:[
    {label:"Cum. AC",values:[12,28,45,63,82,103],tone:"bad"},{label:"Cum. Revenue",values:[16,34,52,70,90,106],tone:"good"}
  ], footer:"Converging cumulative lines mean margin is being compressed." },
  "M3-Q25": { kind:"noData", title:"Cash Flow — source visual", message:"No reporting-period chart data available.", footer:"Missing data is not zero cash exposure." },
  "M3-Q26": { kind:"series", title:"Cash Flow — period and cumulative view", labels:months, series:[
    {label:"Cashin-Revenue",values:[10,15,18,16,22,24],tone:"good"},{label:"Cashout-AC",values:[12,17,20,21,24,26],tone:"bad"},
    {label:"Cashin-Cum.",values:[10,25,43,59,81,105],tone:"gold"},{label:"Cashout-Cum.",values:[12,29,49,70,94,120],tone:"muted"}
  ], footer:"Period movement and cumulative exposure must be read together." },

  "M3-Q27": { kind:"metric", title:"BAC / PV / EV / AC", items:[
    {metric:"BAC",meaning:"Approved total budget",direction:"Baseline"},
    {metric:"PV",formula:"Planned % × BAC",meaning:"Budgeted value planned"},
    {metric:"EV",formula:"Earned % × BAC",meaning:"Budgeted value actually earned"},
    {metric:"AC",meaning:"Actual cost incurred",direction:"Compare with EV"}
  ] },
  "M3-Q28": { kind:"metric", title:"CV / CPI / SV / SPI", items:[
    {metric:"CV",formula:"EV − AC",meaning:"Cost variance",direction:"+ favorable / − unfavorable"},
    {metric:"CPI",formula:"EV / AC",meaning:"Cost efficiency",direction:">1 favorable / <1 unfavorable"},
    {metric:"SV",formula:"EV − PV",meaning:"Schedule variance in value"},
    {metric:"SPI",formula:"EV / PV",meaning:"Schedule performance index"}
  ] },
  "M3-Q29": { kind:"metric", title:"EAC / ETC / VAC", items:[
    {metric:"EAC",formula:"Forecast final cost",meaning:"Where cost is expected to finish"},
    {metric:"ETC",formula:"EAC − AC",meaning:"Expected remaining cost"},
    {metric:"VAC",formula:"BAC − EAC",meaning:"Forecast variance at completion"}
  ], footer:"EAC methodology must always be stated." },
  "M3-Q30": { kind:"metric", title:"Commercial / Profit Metrics", items:[
    {metric:"Contract Price",meaning:"Commercial value of contracted scope"},
    {metric:"Revenue",meaning:"Recognized value; not automatically cash"},
    {metric:"Gross Profit",formula:"Revenue − relevant Cost",meaning:"Profit on the defined basis"},
    {metric:"GP %",formula:"Gross Profit / Revenue × 100",meaning:"Profitability percentage"}
  ] },
  "M3-Q31": { kind:"metric", title:"Direct / Indirect Cost Metrics", items:[
    {metric:"Direct AC",meaning:"Cost attributable to productive scope"},
    {metric:"Indirect AC",meaning:"Support / time-related project cost"},
    {metric:"Monthly Indirect Burn",formula:"Indirect AC / period",meaning:"Cost of time passing"}
  ] },
  "M3-Q32": { kind:"metric", title:"Cash Metrics", items:[
    {metric:"Cash In",meaning:"Actual money received"},
    {metric:"Cash Out",meaning:"Actual money paid"},
    {metric:"Net Cash",formula:"Cash In − Cash Out",meaning:"Period liquidity result"},
    {metric:"Peak Funding Gap",meaning:"Deepest negative cumulative cash position"}
  ] },
  "M3-Q33": { kind:"metric", title:"BOQ Forecast Metrics", items:[
    {metric:"% Completion",meaning:"Controlled physical / earned progress"},
    {metric:"Budget Rate",meaning:"Original unit cost allowance"},
    {metric:"Forecast Rate",meaning:"Expected remaining unit cost"},
    {metric:"Remaining Quantity",meaning:"Physical quantity still required"},
    {metric:"Remaining Budget",meaning:"Budget allowance for unfinished scope"},
    {metric:"BOQ ETC",formula:"Remaining Qty × Forecast Rate + exposures",meaning:"Expected remaining BOQ cost"}
  ] },
  "M3-Q34": { kind:"metric", title:"Waste Metrics", items:[
    {metric:"Actual Waste %",meaning:"Measured excess consumption"},
    {metric:"Budget Waste %",meaning:"Allowed waste in budget"},
    {metric:"Waste Cost",meaning:"EGP impact of waste exposure"}
  ] },
  "M3-Q35": { kind:"metric", title:"Reconciliation & Scenario Metrics", items:[
    {metric:"Reconciliation Gap",meaning:"Difference requiring controlled explanation"},
    {metric:"Remaining Cost Stress",meaning:"Stress applied to remaining-cost assumption"},
    {metric:"Revenue Realization",meaning:"Revenue realization assumption"},
    {metric:"Indirect Cost Stress",meaning:"Stress applied to remaining indirect exposure"},
    {metric:"Scenario EAC",meaning:"Stressed final cost"},
    {metric:"Scenario Revenue",meaning:"Stressed revenue"},
    {metric:"Scenario Margin",meaning:"Stressed profitability"}
  ] },

  "M3-Q36": { kind:"scenario", title:"Healthy Baseline", before:[
    {label:"BAC",value:"900M"},{label:"EV",value:"450M"},{label:"AC",value:"430M"},{label:"CPI",value:"1.047"},
    {label:"EAC",value:"≈860M"},{label:"VAC",value:"≈+40M"},{label:"Forecast Profit",value:"≈+190M"}
  ], after:[], chain:["Healthy efficiency","Forecast under BAC","Positive VAC","Healthy margin"], footer:"Illustrative scenario." },
  "M3-Q37": { kind:"scenario", title:"Problem Hits — AC ↑ / EV ↓", before:[
    {label:"EV",value:"450M"},{label:"AC",value:"430M"},{label:"CPI",value:"1.047"}
  ], after:[
    {label:"EV",value:"420M",status:"bad"},{label:"AC",value:"520M",status:"bad"},{label:"CV",value:"−100M",status:"bad"},{label:"CPI",value:"0.808",status:"bad"}
  ], chain:["AC ↑","EV ↓","CV ↓","CPI ↓"], footer:"More cost, less earned value." },
  "M3-Q38": { kind:"scenario", title:"Forecast & Margin Propagation", before:[
    {label:"EAC",value:"≈860M"},{label:"VAC",value:"≈+40M"},{label:"Profit",value:"≈+190M"}
  ], after:[
    {label:"EAC",value:"≈1,114M",status:"bad"},{label:"VAC",value:"≈−214M",status:"bad"},{label:"Profit",value:"≈−64M",status:"bad"}
  ], chain:["CPI ↓","EAC ↑","VAC ↓","Margin ↓"], footer:"Illustrative CPI-based propagation." },
  "M3-Q39": { kind:"scenario", title:"Liquidity Propagation", before:[
    {label:"Cash In",value:"400M"},{label:"Cash Out",value:"430M"},{label:"Gap",value:"−30M"}
  ], after:[
    {label:"Cash In",value:"410M",status:"warn"},{label:"Cash Out",value:"520M",status:"bad"},{label:"Gap",value:"−110M",status:"bad"}
  ], chain:["Cost / payments ↑","Collection delay","Cash gap widens","Working capital ↑","Financing exposure ↑"] },
  "M3-Q40": { kind:"scenario", title:"Recovery — AC ↑ but EV ↑ faster", before:[
    {label:"EV",value:"420M"},{label:"AC",value:"520M"},{label:"CPI",value:"0.808"}
  ], after:[
    {label:"EV",value:"560M",status:"good"},{label:"AC",value:"600M",status:"warn"},{label:"CPI",value:"0.933",status:"good"},{label:"CV",value:"−40M",status:"warn"}
  ], chain:["EV grows faster than AC","CPI improves","CV improves","Recovery evidence"], footer:"Rising AC can coexist with improving efficiency." },
  "M3-Q41": { kind:"matrix", title:"Deceptive Metric Combinations", headers:["Combination","What it can really mean"], rows:[
    ["AC ↓ / EV ↓ faster","Production may have collapsed"],
    ["EV ↑ / Cash In flat","Operations healthy; collections weak"],
    ["Revenue ↑ / AC ↑ faster","Top-line growth; margin destruction"],
    ["CPI ↑ / cash gap worsens","Efficiency improves; liquidity deteriorates"],
    ["AC stable / Indirect AC ↑","Production slows while time cost burns"]
  ] },
  "M3-Q42": { kind:"flow", title:"CEO Decision Chain", nodes:[
    "Signal","Cause","EGP Exposure","Forecast Impact","Margin Impact","Cash Impact","Recovery Options","Decision","Owner","Deadline","Proof Metric"
  ], footer:"The objective is fast executive diagnosis and accountable action." }
};
