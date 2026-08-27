# CTO CostControl

The complete family/page arrangement and chart/table signal inventory is documented in [`docs/DASHBOARD_CONTENT_MAP.md`](docs/DASHBOARD_CONTENT_MAP.md).

Standalone **CTO Cost Intelligence Command Center** for Next.js/Vercel.

This repository is intentionally isolated from any previous Project Intelligence Hub. It has its own workbook detector, parser, validation gates, generated data model, watcher, UI, tests, Git/Vercel publishing flow and source-audit model.

## Non-negotiable design rules

1. **No project-specific hard-coding.** Runtime source does not contain sample-project branches, fixed project lists, fixed project routes, fixed months, or fixed workbook cell addresses.
2. **Metadata-driven identity.** The `metadata` worksheet determines the project and reporting period. Display names and filenames are never authoritative identity fallbacks.
3. **Workbook-driven UI.** A validated new workbook creates or updates a project dataset and the generated project registry. Next.js reads the registry dynamically.
4. **Project isolation.** Every generated record is namespaced by `project_id`, `reporting_period` and source SHA-256. Isolation/completeness tests block publishing if a raw sheet resolves to another project.
5. **Stable universal dashboard.** Every project uses the same project families, component names and positions. Missing source data leaves an unavailable shell; it never rearranges the dashboard.
6. **Variable workbook capability.** More data is inventoried and remains available in Source Explorer even when it is not recognized by a standard cost module.
7. **No silent loss.** Every visible and hidden sheet is parsed. Populated cells, formulas, detected table regions and embedded Excel chart definitions are retained in generated project data.
8. **No invention.** Missing is not converted to zero and never falls back to another project.
9. **Monthly/revision history.** Each source fingerprint is retained under the metadata-derived reporting period. A later period becomes project `latest`; an older revised period does not overwrite a newer latest period.
10. **Approved HTML parity reference retained.** `docs/parity/` contains the approved reference application and extracted project references for acceptance comparison. The production UI is native Next.js; these references are not the runtime data architecture.

## Main folders

```text
CTO-CostControl/
├─ INPUT/                         # local only; ignored by Git
├─ watcher/                       # adaptive XLSX detector/parser/publisher
├─ public/generated/              # controlled web payloads
│  ├─ projects.json               # dynamic project registry
│  ├─ identity-registry.json       # identifier-to-namespace registry
│  ├─ identity-conflicts.json      # blocked identity alerts for the UI
│  ├─ portfolio/latest.json
│  └─ projects/<project_id>/
│     ├─ latest.json
│     ├─ history/<period>/<sha>.json
│     └─ raw/<period>/<sha-prefix>/<sheet>.json
├─ src/                           # native Next.js command-center UI
├─ tests/                         # isolation/completeness/no-hardcode gates
├─ config/project-identity-migration.json # controlled IDs for legacy projects
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

Drop any `.xlsx`, `.xlsm`, SAP `.otf`, `.xsf`, `.xdf`, `.xml` (with an `XSF` or `XDF` root), `.html`, or `.htm` cost report there. The watcher ignores temporary Excel files beginning `~$`. `INPUT` is a transient inbox, not the history database. Removing a processed source never removes generated periods or revisions.

SAP form inputs are read as embedded source evidence. XSF symbol names, XDF element names, HTML table/meta/input fields, and printable OTF label/value records are mapped into the same isolated JSON contract. Required identity and reporting labels must be embedded using the same metadata names listed below. Missing financial fields remain unavailable; the importer does not manufacture values. Raw binary OTF that does not expose readable metadata must first be exported from SAP as ASCII, XSF, XDF, or HTML.

## Required metadata

Each Excel workbook must contain a worksheet named `metadata` (visible or hidden), with labels in Column A and values in Column B. SAP form sources must embed the same label/value fields as XSF symbols, XDF elements, HTML fields/table rows, or printable OTF records. Labels are read case-insensitively:

| Column A label | Column B value |
|---|---|
| Project SAP ID | Identifier string; optional when Project Code is supplied |
| Project Code | Identifier string; optional when Project SAP ID is supplied |
| Project Name | Descriptive display name |
| Report Start | Excel date or supported unambiguous text date |
| Report Finish | Excel date or supported unambiguous text date |
| Project Start | Original project start date; optional for legacy workbooks |
| Project Finish | Original project finish date; optional for legacy workbooks |
| Project Finish-EOT | Revised finish date after EOT; optional |

Identifiers may contain leading zeros, letters, spaces, slashes, hyphens, underscores and ordinary symbols. Numeric-looking cells with a zero-padding number format retain their displayed leading zeros. Dates are normalized to `YYYY-MM-DD`; the history period key is `<report-start>_to_<report-finish>`. Ambiguous or invalid dates are blocked and recorded in Data Quality rather than guessed.

When `Project Finish-EOT` contains a valid date, it becomes `effective_project_finish`. When it is blank or absent, `Project Finish` is used. The original Project Finish and Project Finish-EOT values remain separate in generated JSON. Legacy workbooks without the three project-date rows continue through the existing identity and reporting-period process unchanged.

### Identity decision table

| Incoming metadata | Registry result | Action |
|---|---|---|
| SAP ID + Code match the same project | Existing | Add validated period/revision; preserve history |
| Both identifiers are new | New | Create isolated namespace, registry entry, latest/history and portfolio entry |
| New SAP ID + existing Code | Conflict | Block update; create critical red Data Quality alert |
| Existing SAP ID + new Code | Conflict | Block update; create critical red Data Quality alert |
| SAP ID and Code point to different projects | Conflict | Block both; no merge or overwrite |
| SAP ID only, existing/new | Existing/New | Resolve or create by SAP ID |
| Code only, existing/new | Existing/New | Resolve or create by Code |
| Both identifiers missing | Unresolved | Block publication as a valid project; retain audit evidence |

Project Name is used only for display. It never overrides identifier conflicts. Identifier lookup uses Unicode-normalized, whitespace-trimmed, case-insensitive canonical keys while retaining the exact source value for audit.

### One local parse without publishing

```bat
WATCH_ONCE_NO_PUBLISH.bat
```

### Restore historical workbooks from the beginning

Place old `.xlsx`/`.xlsm` files in:

```text
CTO-CostControl\Old workbooks\
```

Then run:

```bat
RESTORE_OLD_WORKBOOKS.bat
```

The restoration processes each workbook through the same metadata identity rules, skips fingerprints already present in history, adds missing historical periods/revisions, regenerates project/portfolio JSON, and runs tests, isolation/completeness validation, TypeScript and the production build. Newer project `latest.json` files remain newer; importing an older period does not roll the project backward. The script is local-only and does not push to GitHub/Vercel. Its audit report is written to ignored `.runtime\restore-old-workbooks-report.json`.

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
→ hidden/visible metadata detection and A/B extraction
→ exact SAP ID / Project Code resolution
→ metadata date parsing and report-period identity
→ conflict block or isolated project selection
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
- authoritative project identity and reporting period from the `metadata` worksheet only;
- standard metrics by semantic labels and adjacent numeric values;
- capability flags (cashflow, direct, indirect, BOQ, forecast, ledger, cost codes, waste, wages, reallocation, etc.).

If an unrecognized sheet is added in the future, it is **not discarded**. It remains available in the adaptive Source Explorer and is counted in the completeness manifest.

## History, revisions and legacy migration

- Deleting a workbook from `INPUT` does not delete generated history.
- A new metadata period creates a new `history/<period>/` directory and may become project `latest`.
- A changed SHA-256 in the same period creates another fingerprint-named revision. `history/<period>/latest.json` points to the latest validated revision while older revisions remain.
- Existing generated projects created before metadata identity are migrated into `identity-registry.json` as `legacy_generated_data` without changing their namespace or history.
- Because their real SAP IDs/Codes cannot be inferred safely, populate `config/project-identity-migration.json` before processing a metadata workbook for the same legacy project.

```json
{
  "existing-internal-project-id": {
    "project_sap_id": "SAP-001",
    "project_code": "P/001"
  }
}
```

If a new workbook has the same display name as an unmapped legacy project, automatic creation is blocked instead of guessing or creating a duplicate.

## Critical identity alerts

Conflicting/unresolved workbooks receive a local private evidence copy under ignored `.runtime/identity-problems/<sha>/`; web-safe evidence is stored under `public/generated/identity-problems/` and indexed in `identity-conflicts.json`. They do not update any project `latest.json`, history, or identity registration. The red alert appears first in **Monthly Intelligence & Data Quality** with incoming IDs, project name, report dates, matched/conflicting project, filename, SHA-256, timestamp and reason.

## Universal project dashboard

All current and future projects use the same order:

1. Executive Cost Position
2. Cost & Forecast Engineering
3. Cost Ledger & Controls
4. Data Quality & Source Audit

Standard chart/table shells are always rendered. Missing normalized source data produces `Source data unavailable for this reporting period` in the unchanged position. Additional workbook content remains available in the adaptive Source Explorer and source-audit area.

## Automatic Vercel visibility

After a valid new identity passes parsing and validation, the watcher creates its namespace/history/latest data, registers the identity, regenerates `projects.json` and portfolio JSON, runs unit/isolation/completeness/build gates, then pushes generated data. The dynamic Next.js route, project selector, portfolio and Output Studio read the registry, so no React code edit is required.

## Validation commands

```bat
npm run test
npm run validate:data
npx tsc --noEmit
npm run build
```

Publishing is blocked on any unit, project-isolation, workbook-completeness or production-build failure; the previously deployed validated Vercel version remains unchanged.

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
