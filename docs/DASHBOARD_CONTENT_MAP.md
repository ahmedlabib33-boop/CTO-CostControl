# CTO CostControl dashboard content map

This map applies to every project. Components stay in the same family and page; missing source data shows an unavailable state without moving the layout.

## Portfolio Command Center

### Charts

- **Portfolio Cost Position** — Budget; Earned Value; Actual Cost.
- **Margin vs Cost Performance** — CPI on X; Gross Profit % on Y; Contract Price as bubble size.
- **Direct vs Indirect Actual Cost** — Direct Actual Cost; Indirect Actual Cost.
- **Revenue, Actual Cost & Gross Profit** — Revenue; Actual Cost; Gross Profit.
- **Portfolio Cashflow Comparison** — Cumulative Cash In and Cumulative Cash Out for each selected project.

### CTO Analysis

- **CTO Technical Cost Matrix** — Project; Contract Price; Budget; EV; AC; CV; CPI; Direct AC; Indirect AC; Revenue; Gross Profit; GP %; Indirect Budget Variance; selected-metric comparison.
- **CTO Monthly Cost Comparison chart** — selectable Cash In; Cash Out; Net Cash; Cumulative Cash In; Cumulative Cash Out; Cumulative Net Cash.
- **CTO Monthly Cost Comparison table** — Month; each project value; peer difference; higher-value project.
- **CTO Cost Scenario Lab** — Current AC; Scenario EAC; Scenario Revenue; Scenario Profit; Scenario Margin. Inputs: remaining-cost stress; revenue realization; indirect-cost stress.

## Projects

- **Project cards** — Project Name; Reporting Period; CPI; CV; Sheet Count; Quality Count; Source Mode; Excel Chart Count.

## Monthly Intelligence & Data Quality

- **Critical Identity Control** — SAP Project ID; Project Code; Project Name; Report Period; Matched Identifier; Conflicting Project; Workbook; SHA-256; Detection Time; Conflict Reason.
- **Validated Monthly / Revision History** — Project; Period; Source SHA-256; Budget; EV; AC; CV; CPI.
- **Portfolio Data Quality** — Project; Period; Findings; Sheets; Charts; Source Fingerprint.
- **Source Registry** — Project; Period; Fingerprint; Sheets; Excel Charts; Capabilities; Current AC.

## Project family 1 — Executive

### Page 1: Cost Position

- **Executive KPI cards** — Contract Price; Total Budget Cost; Earned Value; Actual Cost; Cost Variance; CPI; Direct Actual; Indirect Actual; Revenue; Ledger Cost.
- **Budget vs Earned Value vs Actual Cost — by division** — Budget; EV; AC for every division.
- **Cost Performance Map** — Completion % on X; CPI on Y; Original Budget as bubble size; item and division as detail.

### Page 2: Profit & Cashflow

- **Profitability — three source methods kept separate** — Profit / Net Profit; Profit %; Method; Source; Base Label; Base Value.
- **Monthly Cashflow — Cash In vs Cash Out** — Cash In; Cash Out; Net Cash.
- **Cumulative Cashflow / S-Curve** — Cumulative Cash In; Cumulative Cash Out.

### Page 3: Resources & Efficiency

- **Direct Resource Cost Pareto** — Resource; Actual Cost.
- **Waste Efficiency** — Steel Actual Waste %; Steel Budget Waste %; Concrete Actual Waste %; Concrete Budget Waste %.
- **Accounting to Cost-Control Classification Bridge** — Raw Direct Ledger; Equipment Reallocation; Other-Cost Reallocation; Reported Direct Actual Cost.

## Project family 2 — Forecast Engineering

### Page 1: WBS Performance

- **Project Summary / WBS table** — Item; Division; WBS Code; Budget; EV; AC; CV; CPI; Completion; EAC; ETC; VAC; Forecast Status.
- **Project Summary group / total rows** — Source Row and retained source columns A–Q.

### Page 2: BOQ Actual Costs

- **BOQ Resource Actual Cost chart** — Resource; Actual Cost.
- **Detailed BOQ Resource Explorer table** — BOQ / Description; Sheet; Code; Resource; Resource Code; Actual Cost; Quantity; Actual Rate.

### Page 3: BOQ Forecast

- **Detailed BOQ Forecast Analysis table** — BOQ; Resource; Code; Budget Rate; Forecast Rate; Remaining Quantity; EV; BAC; Remaining Budget; ETC.

## Project family 3 — Cost Structure

### Page 1: Direct Costs

- **Direct Details table** — BOQ; WBS Code; Description; Unit; Budget Rate; Contract Rate; Final QS Quantity; Work Quantity; Invoice %; Invoice Amount; EV; AC; CV; ETC; EAC; VAC.

### Page 2: Indirect Costs

- **Indirect Cost Detail table** — Code; Description; Budget; EV; AC; CV; BAC; ETC; EAC; VAC.
- **Indirect Cost Pools table** — Source Classification; Category; Cost.

### Page 3: Allocations & Waste

- **Indirect-Direct Breakdown table** — Main Code; Item; Resource; Actual Cost; Other Cost Reallocation; Equipment Reallocation.
- **Waste Report table** — Source Row Label; Steel; Concrete.
- **Waste Detail table** — all dynamically detected waste-detail fields from the controlled source.

## Project family 4 — Ledger & Controls

### Page 1: Ledger Analytics

- **Actual Expense Trend — source ledger** — Month; Ledger Actual Cost.
- **Expense Source Mix** — SAP Source / Type; Actual Cost.
- **Top Cost Codes by Actual Ledger Cost** — Main Code; Actual Cost.
- **Ledger Reconciliation** — Dashboard Actual Cost; Accounting Ledger; Raw Direct Ledger; Raw Indirect Ledger.

### Page 2: Transactions

- **Actual Expense Ledger table** — Serial Number; Main Code; Direct/Indirect; Source; Item; Description; Total Cost.
- **Selected Transaction Monthly Detail chart** — Month; Monthly Cost.
- **Selected Transaction details** — Main Code; Resource Code; Source; Item; Description; Total Cost.

### Page 3: Cost Code Register

- **Cost Code Lookup table** — Code; Description; Account Type; Type.

## Project family 5 — Source & Assurance

### Page 1: Data Quality

- **Data Quality findings** — Severity; Finding Code / Title; Message.
- **Source Lineage** — Project ID; Reporting Period; Source File; Bytes; SHA-256; Generated Time; Approved-Parity Status; Identity Evidence.
- **Adaptive Workbook Coverage** — Sheets; Detected Tables; Excel Charts; Populated Cells.

### Page 2: Workbook Sources

- **Adaptive Workbook Source Explorer** — Sheet; State; Dimension; Cell Count; Table Count; Chart Count.
- **Detected Source Tables** — Source Row plus dynamically detected source headers and values.
- **Raw Cell Evidence table** — Cell Reference; Value; Formula.
- **Source Sheet Explorer** — Source Row plus every populated source column.

### Page 3: Source Visuals

- **Cost Report Visuals** — every embedded Excel chart, retaining its chart title, source sheet, categories, series and values.
- **Source Media** — every retained embedded workbook image with its source name.

## Output Studio

- **SAP Cost Executive Report**
- **SAP Cost Detailed Report**
- **Cost Control Pack**
- **Monthly Cost Comparison**
- **Cost Reconciliation & Data Quality Report**
- **CTO Portfolio Cost Review**

Each output is generated from the selected controlled project/period or the validated portfolio registry.
