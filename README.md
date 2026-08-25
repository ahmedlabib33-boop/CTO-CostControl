# CTO CostControl

Standalone **CTO Cost Intelligence Command Center** for Next.js/Vercel.

This repository is intentionally isolated from any previous Project Intelligence Hub. It has its own workbook detector, parser, validation gates, generated data model, watcher, UI, tests, Git/Vercel publishing flow and source-audit model.

## Non-negotiable design rules

1. **No project-specific hard-coding.** Runtime source does not contain THE BIG / GLORIA branches, fixed project lists, fixed project routes, fixed months, or fixed workbook cell addresses.
2. **Workbook-driven UI.** A validated new workbook creates or updates a project dataset and the generated project registry. Next.js reads the registry dynamically.
3. **Project isolation.** Every generated record is namespaced by `project_id`, `reporting_period` and source SHA-256. Isolation/completeness tests block publishing if a raw sheet resolves to another project.
4. **Variable workbook capability.** Less data means the unavailable capability is reported as unavailable. More data is inventoried and remains available in Source Explorer even when it is not recognized by a standard cost module.
5. **No silent loss.** Every visible and hidden sheet is parsed. Populated cells, formulas, detected table regions and embedded Excel chart definitions are retained in generated project data.
6. **No invention.** Missing is not converted to zero and never falls back to another project.
7. **Monthly/revision history.** Each source fingerprint is retained under the detected reporting period. A later month becomes project `latest`; an older revised month does not overwrite a newer latest month.
8. **Approved HTML parity reference retained.** `docs/parity/` contains the approved reference application and extracted project references for acceptance comparison. The production UI is native Next.js; these references are not the runtime data architecture.

## Main folders

```text
CTO-CostControl/
├─ INPUT/                         # local only; ignored by Git
├─ watcher/                       # adaptive XLSX detector/parser/publisher
├─ public/generated/              # controlled web payloads
│  ├─ projects.json               # dynamic project registry
│  ├─ portfolio/latest.json
│  └─ projects/<project_id>/
│     ├─ latest.json
│     ├─ history/<period>/<sha>.json
│     └─ raw/<period>/<sha-prefix>/<sheet>.json
├─ src/                           # native Next.js command-center UI
├─ tests/                         # isolation/completeness/no-hardcode gates
├─ config/project-aliases.json    # optional controlled aliases, no code changes
├─ docs/parity/                   # approved HTML reference only
└─ samples/INPUT/                 # supplied June 2026 test workbooks
```

## First local setup

Requirements: Node.js, npm, Python 3, Git.

```bat
npm install
npm run test
npm run validate:data
npm run build
npm run dev
```

Open `http://localhost:3000`.

## Test the supplied workbooks

Generated sample data is already included. To regenerate it:

```bat
GENERATE_SAMPLES.bat
```

The two supplied workbooks deliberately have different sheet/chart structures, making them good adaptive-parser fixtures.

## Live INPUT folder

Create/use:

```text
CTO-CostControl\INPUT\
```

Drop any `.xlsx` cost report there. The watcher ignores temporary Excel files beginning `~$`.

### One local parse without publishing

```bat
WATCH_ONCE_NO_PUBLISH.bat
```

### Continuous automatic parse + Git/Vercel publishing

```bat
START_WATCHER.bat
```

The publish cycle is:

```text
new/changed workbook
→ file stability check
→ SHA-256 fingerprint
→ workbook discovery
→ project + period detection
→ every-sheet extraction
→ semantic metric mapping
→ isolated project output
→ portfolio registry regeneration
→ completeness/isolation validation
→ Next.js production build
→ git commit/push main
→ Vercel Git deployment
→ optional live fingerprint verification
```

Set `CTO_VERCEL_URL` in the local environment if you want the watcher to verify the deployed registry fingerprint through `/api/health` after pushing.

## Important privacy note

Raw `.xlsx/.xls/.xlsm` files and `INPUT/` are Git-ignored. Generated JSON still contains project financial information intended for the dashboard. Use a **private GitHub repository / protected Vercel project** if the data is commercially confidential.

## Workbook discovery behavior

The parser does not use fixed THE BIG / GLORIA coordinates. It reads XLSX Open XML directly and discovers:

- workbook sheet list and hidden/visible state;
- populated cells and formulas;
- merged ranges and dimensions;
- embedded Excel chart definitions and cached series when present;
- table-like regions through header/data heuristics;
- project identity and reporting period from workbook content, with filename only as fallback evidence;
- standard metrics by semantic labels and adjacent numeric values;
- capability flags (cashflow, direct, indirect, BOQ, forecast, ledger, cost codes, waste, wages, reallocation, etc.).

If an unrecognized sheet is added in the future, it is **not discarded**. It remains available in the adaptive Source Explorer and is counted in the completeness manifest.

## Optional project aliases

If a supplier changes a project title substantially between months and automatic identity resolution cannot safely match it, add an alias to:

```text
config/project-aliases.json
```

Example shape:

```json
{
  "project display name from workbook": "permanent-project-id"
}
```

This is controlled configuration, not source-code hard-coding.

## Vercel

Connect the GitHub repository to a new Vercel project. No old dashboard/Vercel configuration is required.

The app exposes:

```text
/api/health
```

which returns the live generated registry fingerprint for deployment verification.

## Output Studio

The application includes a dynamic **Output Studio**. It reads the generated project registry and controlled normalized datasets; it does not hard-code project names or report values.

Available reports:

- SAP Cost Executive Report
- SAP Cost Detailed Report
- Cost Control Pack
- Monthly Cost Comparison
- Cost Reconciliation & Data Quality Report
- CTO Portfolio Cost Review

Each report can be downloaded as a standalone **Interactive HTML** file. HTML exports include collapsible sections, navigation and sortable tables. PDF export opens a print-ready copy of the same selected report with the chosen **A4/A3** and **Portrait/Landscape** page definition; choose **Save as PDF** in the browser print dialog.

The report masthead uses an Eng. Ola-inspired technical-director medallion identity rendered as native HTML/CSS/vector styling, so there is no external logo file dependency.
