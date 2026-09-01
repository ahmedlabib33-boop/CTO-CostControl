import type { ExecutiveModule, ExecutiveQuestion } from "@/lib/ollaMasteryContent";

type ChartLesson = {
  id: string;
  name: string;
  signals: string[];
  howToRead: string;
  whyItMatters: string;
  challenge: string;
};

const CHART_LESSONS: ChartLesson[] = [
  {
    id: "M3-Q01",
    name: "PORTFOLIO COST POSITION",
    signals: ["Budget / BAC", "Earned Value (EV)", "Actual Cost (AC)"],
    howToRead: "Read EV beside AC. EV > AC is normally favorable cost efficiency; EV < AC means more cost has been consumed than budgeted value earned. Derive CV = EV − AC and CPI = EV / AC.",
    whyItMatters: "It answers the first executive question: what value did the project earn for the money consumed?",
    challenge: "What changed in EV versus AC, which project caused it, and is it temporary, structural, or a progress-recognition issue?"
  },
  {
    id: "M3-Q02",
    name: "MARGIN VS COST PERFORMANCE",
    signals: ["X = CPI", "Y = Revenue-based Gross Profit %", "Bubble Size = Contract Price", "Project"],
    howToRead: "Read quadrant, trend, and bubble size together. High CPI + high margin is strong. Low CPI + high margin means margin is protecting weak cost efficiency. High CPI + low margin is operationally efficient but commercially weak. Low CPI + low margin is the danger zone.",
    whyItMatters: "It combines execution efficiency, profitability, and financial materiality in one portfolio view.",
    challenge: "Which large project is moving toward low CPI and low margin, and how much margin remains recoverable?"
  },
  {
    id: "M3-Q03",
    name: "DIRECT VS INDIRECT ACTUAL COST",
    signals: ["Direct AC", "Indirect AC", "Project"],
    howToRead: "Watch the ratio and the trend. Direct cost should broadly move with productive work; indirect cost is often time-sensitive. Direct production slowing while indirect cost keeps burning is a warning.",
    whyItMatters: "It translates delay and overhead into money and exposes projects that are becoming expensive simply to keep alive.",
    challenge: "What is the monthly indirect-cost burn and what would one, three, or six months of delay cost?"
  },
  {
    id: "M3-Q04",
    name: "REVENUE, ACTUAL COST & GROSS PROFIT",
    signals: ["Revenue", "Actual Cost", "Gross Profit", "Project"],
    howToRead: "Gross Profit = Revenue − relevant Cost. If cost grows faster than revenue, margin compresses even while top-line revenue rises.",
    whyItMatters: "Revenue growth can hide profit destruction; the chart keeps margin economics visible.",
    challenge: "How much of the revenue increase converted into profit and which cost category consumed the margin?"
  },
  {
    id: "M3-Q05",
    name: "PORTFOLIO CASHFLOW COMPARISON",
    signals: ["Cash In", "Cash Out", "Project", "Source timeline / month"],
    howToRead: "Cash In above Cash Out means liquidity is being generated; Cash Out above Cash In means the project is consuming corporate funding. Read the cumulative gap, the date of the worst gap, and its duration.",
    whyItMatters: "A profitable project can still create a serious working-capital and financing problem.",
    challenge: "Which project has the largest negative funding gap, when does it peak, and how will it be financed?"
  },
  {
    id: "M3-Q06",
    name: "CTO TECHNICAL COST MATRIX",
    signals: ["Contract Price", "Budget", "EV", "AC", "CV", "Selected metric", "Peer difference", "High / low ratio"],
    howToRead: "Use the matrix to find outliers, then drill down. Weak CPI or high cost can come from productivity, rework, rate, scope, acceleration, a weak baseline, or data-recognition issues.",
    whyItMatters: "It turns a portfolio into a ranked exception list for executive attention.",
    challenge: "Which peer difference is economically material and is it a true performance issue or a scope/definition difference?"
  },
  {
    id: "M3-Q07",
    name: "CTO MONTHLY COST COMPARISON",
    signals: ["Month", "Project", "Selected monthly metric", "Common months / all source months", "Latest comparable month"],
    howToRead: "Compare like-for-like periods and definitions. Look for acceleration, divergence, spikes, trend breaks, and recurring patterns.",
    whyItMatters: "Lifetime totals can mislead when projects have different reporting histories.",
    challenge: "Did the curves diverge because of performance or because the reporting periods, scope, or definitions differ?"
  },
  {
    id: "M3-Q08",
    name: "CTO COST SCENARIO LAB",
    signals: ["Remaining Cost Stress", "Revenue Realization", "Indirect Cost Stress", "Current AC", "Scenario EAC", "Scenario Revenue", "Scenario Margin"],
    howToRead: "Stress remaining cost, revenue realization, and indirect-cost assumptions together. Watch how EAC and margin change instead of relying on one comfortable forecast.",
    whyItMatters: "It shows how resilient or fragile the current business case is.",
    challenge: "Which assumption can reverse the project recommendation and at what stress level does margin become unacceptable?"
  },
  {
    id: "M3-Q09",
    name: "BUDGET VS EARNED VALUE VS ACTUAL COST — BY DIVISION",
    signals: ["Budget", "EV", "AC", "Division"],
    howToRead: "Apply the same EV/AC logic below project level. The portfolio tells you which project is weak; this chart shows which division is causing it.",
    whyItMatters: "It localizes the source of a project-level variance before management acts.",
    challenge: "Which division explains most of the negative CV and what recovery capacity remains?"
  },
  {
    id: "M3-Q10",
    name: "COST PERFORMANCE MAP",
    signals: ["X = % Completion", "Y = CPI to Date", "Bubble Size = Original Budget", "Work item / package"],
    howToRead: "The most dangerous pattern is often a large bubble with high completion and low CPI: high exposure, weak efficiency, and little remaining scope available for recovery.",
    whyItMatters: "The chart adds recovery opportunity to the normal CPI conversation.",
    challenge: "Which large low-CPI package is closest to completion and what specific recovery opportunity is left?"
  },
  {
    id: "M3-Q11",
    name: "PROFITABILITY — THREE SOURCE METHODS KEPT SEPARATE",
    signals: ["Revenue-based Gross Profit", "GP / Net Profit method", "Planned Gross Profit"],
    howToRead: "Do not collapse different profit methods into one number. Confirm the revenue basis, cost basis, exclusions, and whether the figure is planned, actual, or forecast.",
    whyItMatters: "A profit percentage is meaningless until its definition is controlled.",
    challenge: "What is the numerator and denominator, which costs are excluded, and is the number actual, planned, or forecast?"
  },
  {
    id: "M3-Q12",
    name: "MONTHLY CASHFLOW — CASH IN VS CASH OUT",
    signals: ["Cash In", "Cash Out", "Net", "Month"],
    howToRead: "Net Cash = Cash In − Cash Out. A negative month is not automatically a cost-cutting signal; determine whether the cause is collection timing, procurement, a milestone payment, acceleration, or uncontrolled spend.",
    whyItMatters: "Cause determines the corrective action.",
    challenge: "Why is the month negative and is the cause operational, commercial, procurement, or collection-related?"
  },
  {
    id: "M3-Q13",
    name: "CUMULATIVE CASHFLOW / S-CURVE",
    signals: ["Cumulative Cash In", "Cumulative Cash Out", "Month"],
    howToRead: "The vertical gap between cumulative outflow and inflow represents funding exposure. A widening gap means increasing working-capital demand; a closing gap means liquidity recovery.",
    whyItMatters: "Senior management must know the size, date, and duration of peak funding exposure.",
    challenge: "What is peak negative cash, when does it occur, and how long until the gap closes?"
  },
  {
    id: "M3-Q14",
    name: "DIRECT RESOURCE COST PARETO",
    signals: ["Resource / Source Category", "Actual Cost"],
    howToRead: "Rank resources by actual cost and investigate the small number of categories explaining most financial exposure.",
    whyItMatters: "Management attention should follow financial materiality instead of being distributed equally.",
    challenge: "Which three resources explain most of AC and is their exposure driven by rate, quantity, waste, or productivity?"
  },
  {
    id: "M3-Q15",
    name: "WASTE EFFICIENCY",
    signals: ["Actual Waste %", "Budget Waste %", "Steel", "Concrete"],
    howToRead: "Read the gap between actual and allowed waste, then convert the excess percentage into money. Diagnose rework, cutting, damage, design change, theft, procurement dimensions, or data quality.",
    whyItMatters: "Waste becomes an executive issue when its percentage is translated into EGP exposure and future preventability.",
    challenge: "What is the EGP value of excess waste and how much can still be prevented on remaining quantities?"
  },
  {
    id: "M3-Q16",
    name: "ACCOUNTING — COST-CONTROL CLASSIFICATION BRIDGE",
    signals: ["Accounting / ledger basis", "Cost-control classification", "Bridge components", "Reconciliation gap"],
    howToRead: "Explain how one financial basis transforms into another. Different classifications are acceptable when controlled; an unexplained gap is the problem.",
    whyItMatters: "Management cannot trust downstream KPIs if Finance and Cost Control cannot reconcile the underlying number.",
    challenge: "How much of the gap is timing, classification, accrual, mapping, or still unexplained?"
  },
  {
    id: "M3-Q17",
    name: "ACTUAL EXPENSE TREND — SOURCE LEDGER",
    signals: ["Month", "Ledger Actual Cost"],
    howToRead: "Look for spikes, acceleration, and trend breaks. A spike can be real deterioration, a material delivery, accrual correction, subcontract milestone, duplicate posting, or timing event.",
    whyItMatters: "The chart separates normal ledger movement from exceptions that require evidence.",
    challenge: "What transaction set created the spike and is it recurring, one-off, duplicated, or timing-related?"
  },
  {
    id: "M3-Q18",
    name: "EXPENSE SOURCE MIX",
    signals: ["Mat", "Subcontractor", "Petty Cash", "Wages", "Equ", "Transaction Total"],
    howToRead: "Watch changes in source share over time. A rising subcontractor share can indicate outsourcing, acceleration, labor shortage, scope transition, or new dependency.",
    whyItMatters: "Cost composition can reveal changes in the operating model and delivery risk.",
    challenge: "Which source is gaining share fastest and is the change planned, temporary, or structural?"
  },
  {
    id: "M3-Q19",
    name: "TOP COST CODES BY ACTUAL LEDGER COST",
    signals: ["Main Code", "Actual Cost"],
    howToRead: "Rank cost codes, then drill from the largest code into the underlying transactions, vendor/resource, cause, owner, and action.",
    whyItMatters: "It converts thousands of transactions into a focused Pareto of executive exposure.",
    challenge: "Which cost code explains the largest movement this month and what event sits underneath it?"
  },
  {
    id: "M3-Q20",
    name: "LEDGER RECONCILIATION",
    signals: ["Reconciliation scope totals", "EGP values", "Difference / gap"],
    howToRead: "Explain differences between accounting and project-control scopes. Non-zero can be valid; unexplained, stale, or material differences are control failures.",
    whyItMatters: "Confidence in CPI, EAC, margin, and cash starts with confidence in the ledger basis.",
    challenge: "What amount remains unexplained, how old is it, and can it materially change AC, CPI, EAC, or margin?"
  },
  {
    id: "M3-Q21",
    name: "TOTAL ACTUAL COST",
    signals: ["Total Actual Cost", "Source / resource categories", "Category share"],
    howToRead: "Use the source visual to understand cost composition. A large slice means materiality, not automatically inefficiency; pair it with budget, quantity, rate, EV, consumption, or waste.",
    whyItMatters: "It tells management where the money is concentrated before judging performance.",
    challenge: "Which category is financially dominant and what performance metric must be paired with it before judging it?"
  },
  {
    id: "M3-Q22",
    name: "SOIL SETTLEMENT VS OTHER INDIRECT COST",
    signals: ["Soil Settlement", "Other Indirect Cost"],
    howToRead: "Isolate the exceptional indirect-cost event from the remaining pool and judge its share, trend, and recoverability.",
    whyItMatters: "Large exceptional events can disappear inside a generic overhead total.",
    challenge: "Is the event contractually recoverable and what share of total indirect cost does it now represent?"
  },
  {
    id: "M3-Q23",
    name: "GENERAL COMPARISON",
    signals: ["Workbook-defined series", "Categories on the x-axis"],
    howToRead: "If source series are cell-range references or unclear labels, stop interpretation and establish source mapping, units, scope, and period first.",
    whyItMatters: "A visually polished chart can still be decision-unsafe when its series are undefined.",
    challenge: "What does each series represent and are the units, scope, and timing consistent?"
  },
  {
    id: "M3-Q24",
    name: "ACTUAL COST VS REVENUE",
    signals: ["Actual Cost", "Revenue", "Cumulative Actual Cost", "Cumulative Revenue"],
    howToRead: "If cost rises faster than revenue, margin compresses. Period series show current movement; cumulative series show whether deterioration is becoming structural.",
    whyItMatters: "It makes margin compression visible before the project reaches final loss.",
    challenge: "Are the curves converging temporarily or cumulatively and what event caused the change?"
  },
  {
    id: "M3-Q25",
    name: "CASH FLOW — NO REPORTING-PERIOD DATA",
    signals: ["Source chart exists", "No reporting-period chart data available"],
    howToRead: "Treat this as a data-availability condition, not a zero-cash-flow condition. Do not infer performance from a blank source chart.",
    whyItMatters: "Missing evidence must not be mistaken for zero exposure.",
    challenge: "Why is the data unavailable and what validated alternative source supports the decision?"
  },
  {
    id: "M3-Q26",
    name: "CASH FLOW — CASHIN-REVENUE / CASHOUT-AC / CUMULATIVE",
    signals: ["Cashin-Revenue", "Cashout-AC", "Cashin-Cum.", "Cashout-Cum."],
    howToRead: "Use period series to understand the latest movement and cumulative series to determine whether the cash problem is temporary or structural.",
    whyItMatters: "One month can look weak while the cumulative position is healthy, or the reverse.",
    challenge: "Is the latest negative month temporary and is the cumulative funding gap widening or recovering?"
  }
];

const chartQuestions: ExecutiveQuestion[] = CHART_LESSONS.map((c) => ({
  id: c.id,
  question: `How should a CEO read ${c.name}?`,
  answer: `Signals:\n${c.signals.map((s) => `• ${s}`).join("\n")}\n\nHow to read it:\n${c.howToRead}`,
  plainEnglish: c.whyItMatters,
  engOlla: "Read the signal in business terms, then connect it to forecast, margin, cash, recoverability, ownership, and action.",
  managementChallenge: c.challenge
}));

const metricQuestions: ExecutiveQuestion[] = [
  {
    id: "M3-Q27",
    question: "What do BAC, PV, EV and AC mean?",
    answer: "BAC / Budget at Completion — approved cost baseline for the defined scope.\n\nPV / Planned Value — budgeted value of work planned by the status date.\n\nEV / Earned Value — budgeted value of work actually completed by the status date.\n\nAC / Actual Cost — actual cost consumed for the work performed.",
    plainEnglish: "PV tells where we planned to be. EV tells what we physically earned. AC tells what that achievement cost. BAC is the cost baseline for the defined scope.",
    engOlla: "Never confuse money spent with progress achieved. AC is cost; EV is achievement expressed in budget-value terms.",
    managementChallenge: "Are PV, EV and AC measured on the same scope and status date, and is the baseline still valid?"
  },
  {
    id: "M3-Q28",
    question: "What do CV, CPI, SV and SPI mean?",
    answer: "CV = EV − AC. Positive is favorable; negative is unfavorable.\n\nCPI = EV / AC. Above 1 is favorable cost efficiency; below 1 is unfavorable.\n\nSV = EV − PV. Positive means more value earned than planned; negative means less.\n\nSPI = EV / PV. Above 1 is ahead on the earned-value basis; below 1 is behind.",
    plainEnglish: "CV/CPI judge cost efficiency. SV/SPI judge earned progress against plan. All depend on a credible baseline and EV method.",
    engOlla: "An index is only as credible as the baseline and progress recognition behind it.",
    managementChallenge: "What physical cause sits behind the index movement and could baseline or EV recognition be distorting it?"
  },
  {
    id: "M3-Q29",
    question: "What do EAC, ETC and VAC mean?",
    answer: "EAC / Estimate at Completion — current forecast of final project cost.\n\nETC / Estimate to Complete — expected remaining cost. ETC = EAC − AC when the cost basis is consistent.\n\nVAC / Variance at Completion — expected budget variance at finish. VAC = BAC − EAC.\n\nA common performance projection is EAC = BAC / CPI, but management must know the actual forecast method used.",
    plainEnglish: "AC describes history. EAC, ETC, and VAC describe where the project is now expected to finish.",
    engOlla: "Manage the forecast before the overrun becomes history.",
    managementChallenge: "Is EAC bottom-up or formula-driven, which ETC assumptions matter most, and what part of negative VAC is recoverable?"
  },
  {
    id: "M3-Q30",
    question: "What do Contract Price, Revenue, Gross Profit and Gross Profit % mean?",
    answer: "Contract Price — agreed commercial value of the contracted scope, subject to contractual adjustments.\n\nRevenue — value recognized under the project's reporting/accounting methodology; it is not automatically cash received.\n\nGross Profit = Revenue − relevant Cost.\n\nGross Profit % = Gross Profit / Revenue × 100, subject to the exact cost and revenue definitions used.",
    plainEnglish: "Contract value, recognized revenue, cash received, and profit are different concepts.",
    engOlla: "Whenever a profit percentage is presented, ask: based on which revenue and which cost?",
    managementChallenge: "Which costs are included in GP and how much recognized revenue has actually converted to cash?"
  },
  {
    id: "M3-Q31",
    question: "What do Direct AC, Indirect AC and monthly indirect burn mean?",
    answer: "Direct AC — actual cost attributable to productive scope such as materials, labor, equipment, and subcontracted work.\n\nIndirect AC — actual cost supporting project execution but not conveniently attributable to one productive quantity.\n\nMonthly indirect burn — the rate at which time-related indirect cost accumulates each month.",
    plainEnglish: "Direct AC often moves with production. Indirect AC is frequently time-sensitive, so delay can increase cost even when physical quantities do not change.",
    engOlla: "Translate schedule delay into monthly indirect-cost money.",
    managementChallenge: "What does one additional month of delay cost and is acceleration cheaper than continuing the burn?"
  },
  {
    id: "M3-Q32",
    question: "What do Cash In, Cash Out, Net Cash, cumulative cash and peak funding gap mean?",
    answer: "Cash In — actual cash received.\n\nCash Out — actual cash paid.\n\nNet Cash = Cash In − Cash Out for the period.\n\nCumulative Cash In / Out — running totals through time.\n\nPeak Funding Gap / Maximum Overdraft — deepest negative cumulative cash position that must be financed.",
    plainEnglish: "Revenue is not Cash In and cost recognition is not always Cash Out timing. Liquidity needs its own metrics.",
    engOlla: "Ask for the amount, date, duration, funding source, and cost of the worst cash position.",
    managementChallenge: "What is peak negative cash, how long does it last, and what interest or opportunity cost does it create?"
  },
  {
    id: "M3-Q33",
    question: "What do % Completion, Budget Rate, Forecast Rate, Remaining Quantity, Remaining Budget and BOQ ETC mean?",
    answer: "% Completion — controlled physical/earned progress; it should not simply equal money spent divided by budget.\n\nBudget Rate — original cost allowance per unit.\n\nForecast Rate — current expected cost per remaining unit.\n\nRemaining Quantity — physical quantity still required.\n\nRemaining Budget — budget allowance for unfinished scope.\n\nBOQ ETC — expected remaining cost, often informed by Remaining Quantity × Forecast Rate plus applicable remaining exposures.",
    plainEnglish: "Forecast deterioration can come from more quantity, higher rate, lower productivity, or new scope/exposure.",
    engOlla: "Break ETC into quantity, rate, and execution assumptions before accepting the forecast.",
    managementChallenge: "Is deterioration quantity-driven or rate-driven and which assumption is most sensitive?"
  },
  {
    id: "M3-Q34",
    question: "What do Actual Waste %, Budget Waste % and Waste Cost mean?",
    answer: "Actual Waste % — measured excess consumption relative to the applicable engineering/required-consumption basis.\n\nBudget Waste % — waste allowance embedded in the budget.\n\nWaste Cost — monetary value of waste exposure under the project's calculation basis.",
    plainEnglish: "The executive issue is the money represented by excess waste, whether it is avoidable, and how much can still be prevented on remaining quantities.",
    engOlla: "Convert waste percentages into currency, cause, and accountable action.",
    managementChallenge: "What is excess waste worth in EGP and how much can still be prevented?"
  },
  {
    id: "M3-Q35",
    question: "What do Reconciliation Gap, scenario inputs and scenario outputs mean?",
    answer: "Reconciliation Gap — difference between two financial/control bases that should be explained through a controlled bridge.\n\nRemaining Cost Stress — percentage stress applied to the remaining-cost assumption.\n\nRevenue Realization — percentage of expected revenue assumed to be realized under the scenario.\n\nIndirect Cost Stress — percentage stress applied to remaining indirect-cost exposure.\n\nScenario EAC — forecast final cost after scenario assumptions.\n\nScenario Revenue — expected revenue under the selected realization assumption.\n\nScenario Margin — resulting profitability after the cost and revenue stresses.",
    plainEnglish: "Reconciliation Gap is a data-confidence/control metric. Scenario inputs and outputs are resilience metrics. Both can reverse an executive decision.",
    engOlla: "Separate data-confidence risk from economic downside risk.",
    managementChallenge: "What remains unexplained in reconciliation and which stress assumption creates the largest margin loss?"
  }
];

const scenarioQuestions: ExecutiveQuestion[] = [
  {
    id: "M3-Q36",
    question: "CEO Scenario — what does the healthy baseline look like?",
    answer: "Hospital project baseline:\n• Contract Price = 1,050M\n• BAC = 900M\n• EV = 450M\n• AC = 430M\n\nCV = +20M\nCPI = 1.047\nIllustrative EAC using BAC / CPI ≈ 860M\nVAC ≈ +40M\nIf simplified forecast revenue remains 1,050M, forecast profit ≈ 190M.",
    plainEnglish: "The project looks healthy: positive cost variance, CPI above 1, forecast cost below BAC, and a strong simplified margin.",
    engOlla: "A healthy snapshot is the starting point, not the conclusion. Challenge the assumptions supporting it.",
    managementChallenge: "Which assumptions make the 860M EAC credible and what risk could invalidate them?"
  },
  {
    id: "M3-Q37",
    question: "CEO Scenario — what happens if AC rises and EV falls?",
    answer: "Assume MEP productivity collapses, prices rise, rework appears, and part of previously recognized progress is corrected.\n\nAC: 430M → 520M\nEV: 450M → 420M\n\nNew CV = 420 − 520 = −100M\nNew CPI = 420 / 520 ≈ 0.808\n\nThe project moved from CV +20M / CPI 1.047 to CV −100M / CPI 0.808.",
    plainEnglish: "This is a double hit: more cost has been consumed while less budgeted value is recognized as earned.",
    engOlla: "When AC rises and EV falls, challenge both physical performance and the EV-recognition basis immediately.",
    managementChallenge: "How much is real productivity loss versus progress correction and which package caused the swing?"
  },
  {
    id: "M3-Q38",
    question: "CEO Scenario — how does the shock propagate into EAC, VAC and profit?",
    answer: "Using the simple CPI projection:\nEAC = 900 / 0.808 ≈ 1,114M\nVAC = 900 − 1,114 ≈ −214M\nWith simplified forecast revenue at 1,050M:\nForecast result ≈ −64M\n\nThe outlook moved from about +190M profit to about −64M loss: roughly 254M of economic deterioration.",
    plainEnglish: "A cost-efficiency collapse can convert a healthy project into a forecast loss before all final cost has been posted.",
    engOlla: "A current cost problem becomes a capital-allocation problem when it materially changes EAC and margin.",
    managementChallenge: "How much of negative VAC is avoidable, recoverable, claimable, or already unavoidable?"
  },
  {
    id: "M3-Q39",
    question: "CEO Scenario — what happens when cash deteriorates at the same time?",
    answer: "Before the shock:\nCash In = 400M\nCash Out = 430M\nFunding gap = −30M\n\nAfter the shock and slower certification:\nCash In = 410M\nCash Out = 520M\nFunding gap = −110M\n\nThe project now requires roughly 80M more working capital than before.",
    plainEnglish: "The problem is now corporate: liquidity, borrowing capacity, and capital available for other projects are affected.",
    engOlla: "Once a project absorbs scarce corporate liquidity, project recovery and portfolio capital allocation become the same executive conversation.",
    managementChallenge: "Can the company safely fund the −110M gap, what is the financing cost, and what opportunities are displaced?"
  },
  {
    id: "M3-Q40",
    question: "CEO Scenario — can AC rise while performance actually improves?",
    answer: "Yes. After intervention:\nEV: 420M → 560M\nAC: 520M → 600M\n\nAC increased by 80M, but EV increased by 140M.\nNew CPI = 560 / 600 ≈ 0.933\nNew CV = −40M\n\nCPI is still below 1, but it improved materially from 0.808 to 0.933.",
    plainEnglish: "Looking only at AC would miss the recovery. Earned value is growing faster than cost.",
    engOlla: "Rising AC can accompany improving performance; judge the relationship between value earned and cost consumed.",
    managementChallenge: "Is the CPI recovery sustained for multiple periods and which corrective action created it?"
  },
  {
    id: "M3-Q41",
    question: "CEO Scenario — what deceptive metric combinations must management recognize?",
    answer: "• AC ↓ + EV ↓ faster: spending fell because production may have collapsed.\n• EV ↑ + Cash In flat: operations may be healthy while collection fails.\n• Revenue ↑ + AC ↑ faster: top-line growth can hide margin destruction.\n• CPI ↑ + cash gap worsens: cost efficiency can improve while liquidity deteriorates.\n• AC stable + Indirect AC ↑: time-related overhead can burn while production slows.",
    plainEnglish: "A single green KPI can coexist with a serious problem elsewhere. CEO-level control means reading linked metrics.",
    engOlla: "Never let one attractive KPI overrule the economic chain around it.",
    managementChallenge: "Which favorable KPI could be hiding a worse cash, margin, schedule, or capital position?"
  },
  {
    id: "M3-Q42",
    question: "CEO Scenario — what should Eng. OLLA ask and decide when the system turns red?",
    answer: "Ask in sequence:\n1. What changed in economic reality?\n2. Which project/division/WBS/BOQ/resource caused it?\n3. Is it rate, quantity, productivity, rework, scope, timing, or data?\n4. What happens to CPI, ETC, EAC, VAC, and margin?\n5. What happens to Cash In, Cash Out, and peak funding?\n6. What is commercially recoverable?\n7. What can still be operationally recovered?\n8. Which response creates the best economic recovery?\n9. Who owns it and by when?\n10. Which metric will prove recovery?",
    plainEnglish: "Possible decisions include acceleration, subcontractor replacement, procurement intervention, variation recovery, certification escalation, supplier-term negotiation, selective spending restraint, EAC revision, or controlled acceptance of an unavoidable loss.",
    engOlla: "Connect signal → business consequence → cause → decision → owner → proof of recovery.",
    managementChallenge: "For every red signal demand: cause → EGP exposure → recovery option → owner → deadline → proof metric."
  }
];

export const CEO_COST_CONTROL_MASTERY: ExecutiveModule = {
  id: "ceo-cost-control-mastery",
  number: "03",
  title: "CEO Cost-Control Mastery",
  subtitle: "Read the signal, challenge the cause, protect margin and capital.",
  description: "Every major cost-control chart, the metrics behind it, how senior management reads it, and one linked deterioration/recovery scenario.",
  questions: [...chartQuestions, ...metricQuestions, ...scenarioQuestions],
  summary: {
    steps: [
      { label: "DATA", detail: "Is the source complete and reconciled?" },
      { label: "METRIC", detail: "What exactly is being measured?" },
      { label: "CHART", detail: "What relationship or trend is visible?" },
      { label: "SIGNAL", detail: "What changed and how material is it?" },
      { label: "CAUSE", detail: "Rate, quantity, productivity, scope, timing, or data?" },
      { label: "FORECAST", detail: "What happens to ETC, EAC, and VAC?" },
      { label: "MARGIN", detail: "How much value is being created or destroyed?" },
      { label: "CASH", detail: "What liquidity and financing exposure follows?" },
      { label: "DECISION", detail: "Which response creates the best economic recovery?" },
      { label: "OWNER", detail: "Who is accountable and by when?" },
      { label: "PROOF", detail: "Which future metric confirms recovery?" }
    ],
    engOlla: [
      "Do not review isolated numbers. Read the chain from data quality to business value.",
      "Move from red signal to cause, EGP exposure, decision, owner, and proof of recovery in minutes."
    ],
    executiveNumbers: [
      "EV vs AC and CPI",
      "Current EAC / ETC / VAC",
      "Forecast Margin",
      "Peak Negative Cash / Funding Gap",
      "Indirect-Cost Monthly Burn",
      "Top Cost Driver / Cost Code",
      "Unexplained Reconciliation Gap"
    ]
  }
};
