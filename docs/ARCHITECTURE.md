# Architecture and acceptance gates

## Source of truth

Raw workbook → adaptive extraction → canonical isolated project JSON → dynamic Next.js presentation.

The browser does not write back to source actuals. Scenario Lab is explicitly non-source data.

## Completeness gate

For every published workbook:

- discovered sheet count == manifest sheet count;
- unaccounted sheet count == 0;
- every manifest sheet has an isolated raw JSON artifact;
- raw JSON `project_id` must match its project namespace;
- embedded Excel chart definitions are inventoried;
- formula-error cells are surfaced as quality findings.

## Isolation gate

A project route can load only `/generated/projects/<project_id>/...`. Raw artifacts repeat the same project ID and source fingerprint. Any mismatch fails validation.

## Safe adaptive fallback

Unknown source structure is preserved and shown through Source Explorer. The forbidden fallback is to borrow values from another project, substitute zero for missing information, or discard unknown structures.

## UI parity policy

The approved CTO HTML in `docs/parity/` is the visual/behavioral acceptance reference. Native Next.js may improve responsiveness, navigation, filtering, loading and source lineage, but must not intentionally remove an approved table, chart, description or interaction. Source Explorer is the final completeness safety net for new/unrecognized workbook structures.
# Metadata identity and persistence extension

The local watcher treats `INPUT/` only as a transient inbox. Generated history is append-preserving and is never reconciled against the current contents of `INPUT`.

The authoritative identity flow is:

```text
metadata worksheet (visible or hidden)
-> Column A label / Column B value extraction
-> identifier/date normalization with source evidence
-> identity-registry.json lookup by SAP ID and/or Project Code
-> existing | new | conflict | unresolved decision
-> conflict evidence only, or isolated parse/history/latest update
-> projects.json + portfolio/latest.json regeneration
```

`project_name` is descriptive and never resolves a conflicting identifier. A same-name match to an unmapped legacy project blocks automatic creation until `config/project-identity-migration.json` supplies controlled identifiers. Valid new projects create their stable internal namespace automatically.

The project UI is a universal template with four fixed families: Executive Cost Position, Cost & Forecast Engineering, Cost Ledger & Controls, and Data Quality & Source Audit. Fixed analytical shells render in the same order for every project; unavailable source data remains an explicit empty state. Adaptive workbook charts/tables remain in the source-audit family.
