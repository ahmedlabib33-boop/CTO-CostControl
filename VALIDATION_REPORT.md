# CTO CostControl — Packaging Validation

## Passed

- Adaptive parser generated THE BIG June 2026: 36 sheets, 5 embedded Excel charts.
- Adaptive parser generated GLORIA June 2026: 51 sheets, 6 embedded Excel charts.
- Exact approved normalized parity payloads retained by source SHA-256.
- Project registry contains unique isolated project namespaces.
- Every manifest sheet has an isolated raw JSON artifact.
- Cross-project raw-data checks passed.
- `unaccounted_sheets == 0` for generated projects.
- Portfolio CPI and CV are derived from the selected project's EV/AC rather than ambiguous detail labels.
- New-project adaptive test passed using a synthetic workbook with a previously unseen table structure.
- Revision-history test passed.
- Runtime no-project-hardcoding test passed.
- Output Studio no-project-hardcoding test passed.
- Output Studio report contract passed: six dynamic reports, project/period revision selector, Interactive HTML, A4/A3, Portrait/Landscape and PDF print/export workflow.
- Python unittest suite: 10 tests passed.
- Python data validation gate passed.
- TS/TSX syntax parsing of the modified Output Studio and Dashboard files produced no syntax diagnostics; unresolved React/module diagnostics are expected until local `npm install` is run.

## Output Studio PDF behavior

The PDF action opens the same generated report in a print-ready browser window with the selected CSS `@page` size/orientation. Choose **Save as PDF** in the browser print dialog. This keeps the package dependency-free for PDF rendering and works with the report's full HTML tables/SVG graphics.

## Environment limitation during packaging

The prior packaging environment could not complete `npm install`, so a final `next build` is still not claimed as executed here. The source package intentionally does not include `node_modules`. Run `npm install`, then `npm run build` locally as documented in `docs/LOCAL_SETUP.md` before connecting the watcher to publishing.
