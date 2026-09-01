# COST RISK TAB — CODEX OPERATING STANDARD
## Risk Detection, Suggested Actions, Plugin Orchestration, and Residual-Risk Control

**Purpose**

This file defines the mandatory operating logic for any Codex/AI agent that analyzes construction cost-control outputs and generates a **Risk Tab** with **Suggested Actions**.

The Risk Tab must not duplicate the Cost Tab.

```text
COST TAB
= What the numbers are

RISK TAB
= What the numbers mean
+ what may happen
+ why it may happen
+ how much is exposed
+ what action is recommended
+ who should act
+ expected mitigation effect
+ residual risk
```

---

# 1. MANDATORY DATA FLOW

```text
SOURCE DATA
   ↓
Cost Analysis Engine
   ↓
Normalized Cost Outputs
   ↓
Risk Detection Engine
   ↓
Root Cause Analysis
   ↓
Forecast Consequence
   ↓
Suggested Action Engine
   ↓
Action Prioritization
   ↓
Manager Approval
   ↓
Execution System
   ↓
Residual Risk Recalculation
   ↓
Risk Tab / Management Dashboard
```

Recommended technical implementation:

```text
cost_output.json
      ↓
risk_engine.py
      ↓
risk_output.json
      ↓
Risk Tab
```

---

# 2. CODEX CAPABILITY DISCOVERY RULE

Before analysis, Codex must identify which tools, plugins, connectors, files, APIs, scripts, and databases are available.

Preferred implementation sequence:

```text
Files / Google Drive
→ Coupler.io when automated integration is required
→ Codex / ChatGPT analysis
→ Airtable / Supabase for structured intelligence
→ ClickUp for action execution
→ Contract/commercial review when relevant
→ Reporting / Dashboard
→ Feedback loop
```

If a preferred tool is unavailable, use the strongest available equivalent.

Never stop the workflow only because a preferred plugin is unavailable.

---

# 3. RECOMMENDED PLUGINS / CONNECTED CAPABILITIES

## 3.1 Core Cost-Risk Stack

| Priority | Plugin / Capability | Primary Role |
|---|---|---|
| 1 | Google Drive / Files | Read cost reports, SAP exports, PDFs, forecasts, supporting evidence |
| 2 | Coupler.io | Automated ingestion from ERP, finance, CRM, project systems |
| 3 | Codex / ChatGPT | Main analytical and reasoning engine |
| 4 | Airtable | Structured risk register and intelligence database |
| 5 | ClickUp | Risk mitigation tasks, owners, deadlines, follow-up |
| 6 | Supabase | Application database and persistent structured storage |
| 7 | GitHub | Version control for risk engine, rules, UI and documentation |
| 8 | Safe2Sign Contract Risk Check | Contract/commercial exposure review |
| 9 | Gmail | Correspondence evidence and follow-up |
| 10 | Google Calendar | Due dates, reviews, mitigation deadlines |
| 11 | Google Contacts | Resolve owners and stakeholders |
| 12 | Ace Knowledge Graph | Risk-cause-impact-action relationship mapping |
| 13 | Mermaid Chart | Risk-chain and dependency visualization |
| 14 | Vercel | Deployment of the Risk application/dashboard |
| 15 | Figma | Risk-tab UI/UX design |
| 16 | Adobe | PDF/report workflow and executive deliverables |
| 17 | HubSpot | Client/commercial information where applicable |
| 18 | Readwise | Historical knowledge and lessons learned |
| 19 | Hugging Face | Optional ML models / datasets for advanced prediction |

---

# 4. TOOL SUBSTITUTION RULE

```text
Airtable unavailable
→ Supabase
→ SQL
→ SQLite
→ Excel
→ CSV
→ JSON

ClickUp unavailable
→ Existing task system
→ Action Register
→ Excel
→ JSON
→ Markdown action log

Coupler.io unavailable
→ API
→ Python ingestion
→ Power Query
→ CSV/XLSX import

Google Drive unavailable
→ Uploaded Files
→ Local repository data
→ Equivalent document source
```

The workflow and governance must remain unchanged.

---

# 5. REQUIRED COST OUTPUTS

The Risk Engine should consume calculated outputs such as:

```text
BAC
PV
EV
AC
CV
CPI
SPI
EAC
ETC
VAC
TCPI

Budget
Actual Cost
Committed Cost
Accruals
Forecast
Remaining Budget
Contingency

Revenue
Certified Revenue
Collected Revenue
Outstanding Receivables

Pending Variations
Approved Variations
Rejected Variations
Claims

Planned Productivity
Actual Productivity

Previous Period EAC
Current EAC

Previous Period ETC
Current ETC

Cash In
Cash Out
```

---

# 6. MAIN RISK CATEGORIES

Standard taxonomy:

```text
01 Budget Risk
02 Forecast Risk
03 Actual Cost Risk
04 Commitment Risk
05 Procurement Risk
06 Productivity Risk
07 Subcontract Risk
08 Material Risk
09 Equipment Risk
10 Labour Risk
11 Cash Flow Risk
12 Revenue Risk
13 Certification Risk
14 Collection Risk
15 Variation Risk
16 Claim Risk
17 Contingency Risk
18 Schedule-Cost Interaction Risk
19 Data Quality Risk
20 Forecast Reliability Risk
```

---

# 7. RISK TAB EXECUTIVE KPIs

The Risk Tab should show:

```text
Overall Cost Risk Score
Total Open Risks
Critical Risks
High Risks
Total Cost Exposure
Expected Monetary Value
Forecast Overrun
Contingency Coverage
Projects at Risk
Expected Risk Reduction
Residual Risk
```

Example:

```text
Overall Risk Score      78 / 100
Total Exposure          12.8 M
EMV                     6.4 M
Forecast Overrun        8.1%
Contingency Coverage    42%
Critical Risks          3
High Risks              7
Expected Risk Reduction 18%
Residual Risk Score     60 / 100
```

---

# 8. OVERALL COST RISK SCORE

Recommended initial model:

```text
Overall Cost Risk Score =

20% × Forecast Overrun Risk
+ 15% × CPI Risk
+ 15% × ETC Growth Risk
+ 10% × Commitment Risk
+ 10% × Contingency Risk
+ 10% × Cash Flow Risk
+ 10% × Revenue / Certification Risk
+ 5% × Productivity Risk
+ 5% × Data Quality Risk
```

Normalize each component:

```text
0   = No detected risk
100 = Extreme risk
```

Classification:

| Score | Classification |
|---:|---|
| 0–24 | Low |
| 25–49 | Moderate |
| 50–69 | High |
| 70–84 | Very High |
| 85–100 | Critical |

Thresholds must be configurable.

---

# 9. BASIC RISK FORMULAS

```text
Risk Score = Probability × Impact
```

Enhanced:

```text
Risk Score = Probability × Impact × Urgency
```

Expected Monetary Value:

```text
EMV = Probability × Financial Impact
```

Contingency coverage:

```text
Contingency Coverage =
Remaining Contingency / Total Open Risk Exposure
```

ETC growth:

```text
ETC Growth % =
(Current ETC - Previous ETC) / Previous ETC
```

Forecast overrun:

```text
Forecast Overrun =
EAC - BAC
```

Forecast overrun %:

```text
Forecast Overrun % =
(EAC - BAC) / BAC
```

Uncertified revenue:

```text
Executed Value - Certified Value
```

Outstanding certified revenue:

```text
Certified Value - Collected Value
```

---

# 10. AUTOMATIC RISK DETECTION RULES

## 10.1 Forecast Overrun

```text
IF EAC > BAC
→ Forecast Cost Overrun Risk
```

Example thresholds:

```text
EAC/BAC <= 1.02 → Low
1.02–1.05       → Medium
1.05–1.10       → High
>1.10           → Critical
```

## 10.2 CPI Risk

```text
CPI = EV / AC
```

Suggested interpretation:

```text
CPI >= 1.00       Healthy
0.95–0.999        Watch
0.90–0.949        High
<0.90             Critical
```

## 10.3 ETC Deterioration

```text
IF ETC Growth > configurable threshold
→ Forecast Deterioration Risk
```

## 10.4 Commitment Risk

```text
IF Actual + Commitments + ETC > Available Budget
→ Budget / Commitment Risk
```

## 10.5 Contingency Risk

```text
IF Contingency Coverage < required threshold
→ Contingency Adequacy Risk
```

## 10.6 Cash Risk

Detect:

```text
Negative net cash flow
Increasing receivable ageing
Certified but unpaid amount increasing
Supplier payment exposure increasing
```

## 10.7 Revenue Leakage Risk

Analyze:

```text
Executed Value - Certified Value
Certified Value - Collected Value
```

## 10.8 Productivity Risk

Compare:

```text
Planned Cost/Unit
vs
Actual Cost/Unit
```

## 10.9 Forecast Reliability Risk

Detect:

```text
EAC increasing across consecutive reporting periods
ETC increasing across consecutive reporting periods
Frequent forecast revisions
Large forecast volatility
```

## 10.10 Data Quality Risk

Detect:

```text
Missing cost codes
Duplicate transactions
Broken formulas
Unmapped WBS
Inconsistent periods
Incorrect units
Negative values where not expected
Missing previous-period values
```

---

# 11. MANDATORY RISK RECORD

Every detected material risk should include:

```text
risk_id
project_id
project_name
wbs_id
cost_code

risk_category
risk_title
risk_description

source_metric
trigger
current_value
threshold

severity
probability
financial_impact
time_impact
emv

trend
root_cause
forecast_consequence

suggested_action
action_reason
action_priority

owner_role
supporting_roles

target_date
escalation_rule

evidence_refs
confidence_score

approval_required
approval_status

action_status
external_task_id

previous_risk_score
current_risk_score
expected_post_action_score
residual_risk_score
```

---

# 12. SUGGESTED ACTION ENGINE

Every material risk must produce at least one practical action.

The engine must answer:

```text
What should be done?
Why should it be done?
Who should own it?
Who should support?
How urgent is it?
What is the target?
What is the escalation rule?
What evidence supports it?
What risk reduction is expected?
```

---

# 13. SUGGESTED ACTION FORMAT

Example:

```text
RISK ID:
CR-014

CATEGORY:
Cost Performance

SIGNAL:
CPI < 0.90

CURRENT VALUE:
0.87

THRESHOLD:
0.90

SEVERITY:
CRITICAL

TREND:
DETERIORATING

FINANCIAL EXPOSURE:
4,850,000

PROBABILITY:
82%

EMV:
3,977,000

LIKELY ROOT CAUSE:
Labour productivity deterioration

EVIDENCE:
- Actual labour cost increasing
- Earned value growth below actual cost growth
- Cost/unit deteriorating for 3 reporting periods

FORECAST CONSEQUENCE:
Current trend may cause EAC to exceed BAC materially.

SUGGESTED ACTION:
1. Reforecast remaining labour ETC.
2. Identify WBS packages driving CPI deterioration.
3. Compare planned vs actual productivity.
4. Review overtime and labour composition.
5. Prepare a recovery scenario.
6. Freeze avoidable discretionary cost until forecast validation.

OWNER:
Cost Control Manager

SUPPORT:
Planning
Construction
Commercial

PRIORITY:
Critical

TARGET:
Next reporting cycle

ESCALATION:
Escalate to Project Manager if forecast variance remains above configured threshold.

APPROVAL REQUIRED:
Yes

ACTION STATUS:
Proposed
```

---

# 14. ACTION APPROVAL WORKFLOW

Codex may recommend actions automatically.

High-impact business actions must not be treated as approved unless approval is explicitly granted.

```text
Risk Detected
     ↓
Suggested Action
     ↓
Status = PROPOSED
     ↓
Manager Review
     ↓
Approve / Modify / Reject
     ↓
If Approved
     ↓
Create Action in ClickUp / Equivalent
     ↓
Execution
     ↓
Closure Evidence
     ↓
Risk Recalculation
```

---

# 15. CLICKUP / ACTION MANAGEMENT RULE

When an action is approved, create or prepare:

```text
Task Title
Risk ID
Project
WBS
Action Description
Owner
Support Roles
Priority
Due Date
Escalation Rule
Evidence Link
Expected Risk Reduction
Status
Closure Evidence
```

Mandatory principle:

> A material risk without an owner and an action is not considered controlled.

---

# 16. STRUCTURED INTELLIGENCE STORAGE

Use Airtable, Supabase, SQL, or equivalent for persistent risk intelligence.

Recommended tables:

```text
Projects
Cost Accounts
Risks
Risk Signals
Risk History
Actions
Evidence
Forecasts
Changes
Variations
Claims
Lessons Learned
Decisions
```

---

# 17. CONTRACT / COMMERCIAL REVIEW TRIGGER

Invoke contract/commercial review when the risk involves:

```text
Payment
Certification
Variation
Claim
Notice
Delay
Liquidated damages
Retention
Advance payment
Bond
Tax
Insurance
Entitlement
Change
Employer obligation
Contractor obligation
Subcontract liability
```

Required chain:

```text
Evidence
→ Relevant Clause
→ Obligation / Right
→ Event
→ Exposure
→ Recommended Position
```

Do not present contractual certainty when evidence is incomplete.

---

# 18. ROOT CAUSE CATEGORIES

Recommended root-cause library:

```text
Productivity
Procurement
Material Price
Subcontractor Performance
Design Change
Scope Growth
Rework
Schedule Delay
Acceleration
Overtime
Resource Mix
Equipment Inefficiency
Low Certification
Late Collection
Unapproved Variation
Forecast Error
Quantity Growth
Data Quality
Commercial Dispute
Contractual Exposure
Management Decision
```

---

# 19. EARLY WARNING ENGINE

Separate current problems from emerging risks.

Example warnings:

```text
ETC increased 8.7% this month
Concrete productivity deteriorated for 3 periods
Remaining contingency covers only 54% of exposure
Three procurement packages exceed available budget
Certification lag increased to 47 days
EAC increased for 3 consecutive periods
```

---

# 20. RISK TREND

Every risk should be tagged:

```text
↑ Deteriorating
→ Stable
↓ Improving
```

Track history:

```text
April  42
May    51
June   63
July   76
```

---

# 21. WBS RISK HEATMAP

Risk analysis must support drilldown:

```text
Company
→ Project
→ WBS
→ Cost Code
→ Risk
→ Underlying Transactions
```

Example:

| WBS | Budget | EAC | Variance | Risk |
|---|---:|---:|---:|---|
| B01 | 20M | 20.5M | +0.5M | Medium |
| B02 | 18M | 22M | +4M | Critical |
| B03 | 15M | 16M | +1M | High |
| B04 | 25M | 24M | -1M | Low |

---

# 22. RISK DRIVER ANALYSIS

Rank risk drivers based on financial exposure, not only count.

Example:

```text
32% Productivity
24% Procurement
18% Variations
11% Subcontractors
 8% Cash Collection
 7% Other
```

---

# 23. MITIGATION EFFECT

For every significant recommended action calculate or estimate:

```text
Original Risk
→ Proposed Action
→ Expected Risk Reduction
→ Expected Post-Action Risk
→ Residual Risk
```

Example:

```text
Current Risk Score        82
Expected Risk Reduction   31
Expected Post-Action      51
Residual Risk             38
```

---

# 24. RISK TAB LAYOUT

```text
┌──────────────────────────────────────────────────────────┐
│                    COST RISK CONTROL                     │
├─────────┬─────────┬─────────┬──────────┬────────────────┤
│ Score   │Exposure │ EMV     │Critical  │ Risk Reduction │
├──────────────────────────────────────────────────────────┤
│ EARLY WARNINGS                                           │
├──────────────────────────┬───────────────────────────────┤
│ TOP RISK DRIVERS         │ RISK TREND                    │
├──────────────────────────┼───────────────────────────────┤
│ WBS HEATMAP              │ PROBABILITY × IMPACT         │
├──────────────────────────────────────────────────────────┤
│ RISK REGISTER                                            │
│ Risk | Signal | Exposure | Score | Trend | Confidence   │
├──────────────────────────────────────────────────────────┤
│ SUGGESTED ACTIONS                                        │
│ Risk | Action | Owner | Priority | Due | Approval       │
├──────────────────────────────────────────────────────────┤
│ MITIGATION EFFECT                                        │
│ Before Risk → Action → Expected Risk → Residual Risk    │
└──────────────────────────────────────────────────────────┘
```

---

# 25. CODEX MANDATORY OPERATING INSTRUCTION

```text
For every cost-risk analysis task:

1. Discover available tools and connected capabilities.
2. Identify and preserve the authoritative cost source.
3. Retrieve relevant cost outputs and supporting evidence.
4. Validate data quality before risk analysis.
5. Normalize cost outputs into a standard schema.
6. Detect cost, forecast, commitment, procurement, productivity,
   subcontract, material, labour, equipment, cash, revenue,
   certification, collection, variation, claim, contingency,
   schedule-cost, forecast-reliability and data-quality risks.
7. For each material risk determine:
   - signal
   - trigger
   - current value
   - threshold
   - probability
   - impact
   - financial exposure
   - EMV
   - severity
   - trend
   - root cause
   - forecast consequence
   - confidence
8. Generate at least one evidence-based Suggested Action.
9. Specify:
   - action
   - reason
   - owner
   - supporting roles
   - priority
   - target
   - escalation
   - expected risk reduction
10. Store reusable structured intelligence using Airtable,
    Supabase, SQL or the strongest available equivalent.
11. Keep high-impact actions in PROPOSED status until approved.
12. When approved, use ClickUp or equivalent action system.
13. Trigger contract/commercial review whenever the risk has
    contractual, payment, change, claim, notice, variation,
    certification or liability implications.
14. Recalculate risk after mitigation.
15. Show:
    Current Risk
    → Suggested Action
    → Expected Risk Reduction
    → Residual Risk.
16. Maintain traceability:
    Source
    → Metric
    → Risk
    → Evidence
    → Recommendation
    → Action
    → Result.
```

---

# 26. DEFINITION OF DONE

A Risk Tab is complete only when:

- [ ] Cost outputs are validated.
- [ ] Material cost risks are detected.
- [ ] Each material risk has severity.
- [ ] Each material risk has probability.
- [ ] Each material risk has financial impact.
- [ ] EMV is calculated where applicable.
- [ ] Trend is identified.
- [ ] Root cause is identified or marked uncertain.
- [ ] Forecast consequence is stated.
- [ ] Suggested Action is generated.
- [ ] Owner role is identified.
- [ ] Action priority is assigned.
- [ ] Escalation logic exists where required.
- [ ] Evidence traceability exists.
- [ ] Approval status is defined.
- [ ] Expected mitigation effect is shown.
- [ ] Residual risk is shown.
- [ ] Actions can be transferred to ClickUp or equivalent.
- [ ] Structured intelligence can be stored in Airtable/Supabase/equivalent.
- [ ] Contract/commercial review is invoked where relevant.
- [ ] Original source remains preserved.
- [ ] No unsupported conclusion is presented as fact.

---

# 27. CORE GOVERNANCE RULE

> **Cost output → risk signal → root cause → exposure → forecast consequence → suggested action → owner → approval → execution → residual risk.**

This sequence is mandatory for any agent implementing or operating the Cost Risk Tab.
