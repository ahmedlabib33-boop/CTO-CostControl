# CODEX IMPLEMENTATION PROMPT — ENG. OLLA CEO COST-CONTROL MASTERY + VISUAL ILLUSTRATIONS

Implement the supplied code package into the existing `CTO-CostControl` Next.js application.

## BINDING REQUIREMENT

**Keep the existing hidden/trick-layer access mechanism.**

Do not redesign, replace, expose, rename, simplify, or refactor the existing access mechanism. Do not change the existing opening experience, timing, hero sentence, return-to-dashboard control, navigation behavior, session progress behavior, keyboard navigation, or current Module 01 / Module 02 content except where the supplied patch explicitly changes an import.

The new work is an **extension of the existing Eng. OLLA mastery layer**, not a new page and not a replacement.

## SOURCE FILES TO ADD

Add exactly:

- `src/lib/ollaCeoMasteryContent.ts`
- `src/lib/ollaCeoVisuals.ts`
- `src/lib/ollaMasteryModules.ts`
- `src/components/OllaMasteryVisual.tsx`

Append the supplied CSS from `patches/APPEND_globals.css` to the existing `src/app/globals.css`.

Apply the exact patch instructions in:

- `patches/PATCH_EngOllaMastery.txt`
- `patches/PATCH_tests.txt`

## WHAT MODULE 03 MUST CONTAIN

Create a third mastery module:

**03 — CEO Cost-Control Mastery**

The supplied content is authoritative. Do not shorten it, remove questions, merge questions, or replace terminology.

Module 03 contains:

- 26 chart-reading lessons
- definitions/formulas for every metric used by those lessons
- one linked real-world CEO scenario
- deterioration case: `AC ↑ + EV ↓`
- propagation into `CV`, `CPI`, `EAC`, `VAC`, margin and cash
- reverse/recovery case: `AC ↑ but EV ↑ faster`
- deceptive KPI combinations
- final CEO decision chain

Maintain the existing maximum of **3 questions per page**.

## VISUAL REQUIREMENT

Every Module 03 question must display a visual illustration when its answer is revealed.

Use the supplied `OllaMasteryVisual.tsx` and `ollaCeoVisuals.ts`.

Visuals must be native HTML/CSS/SVG/React only. Do not add chart libraries or dependencies.

Visual illustrations include:

- multi-series cost / EV / AC lines
- margin-vs-cost executive quadrant
- direct-vs-indirect donut
- revenue / AC / profit bars
- cash-in / cash-out lines
- technical cost matrix
- monthly comparison lines
- scenario margin bars
- division performance bars
- completion/CPI quadrant
- three-profit-method comparison
- monthly and cumulative cashflow
- Pareto bars
- waste comparison
- accounting-to-cost-control reconciliation bridge
- ledger trend
- source-mix donut
- top cost-code Pareto
- ledger reconciliation table
- actual-cost composition
- indirect-cost concentration
- workbook series definition table
- AC vs revenue trend
- explicit no-data state
- metric formula cards
- before/after CEO scenario cards
- impact chains and final decision flow

## SAME STYLE — NON-NEGOTIABLE

The new content must look like it was always part of the existing Eng. OLLA experience.

Do not create a new design language.

Preserve the existing:

- typography and font inheritance
- black background
- champagne-gold hierarchy
- text sizes and spacing philosophy
- card radius language
- border language
- motion / reveal language
- responsive behavior
- premium restrained executive feel

The supplied CSS intentionally does **not** set a font family and does **not** replace the overlay background. It inherits the existing layer.

If the existing Eng. OLLA CSS already exposes a gold token, map `--olla-ceo-gold` to it rather than introducing a visibly different gold.

Do not change the main CTO dashboard theme.

## X/Y / LIVE-DATA RULE

Do **not** invent or hard-code live project X/Y values.

For charts whose concepts use X and Y axes, preserve the correct axis meaning/labels, but keep the supplied visual illustration semantic/normalized unless existing application data can be connected safely without changing the lesson content.

The training visuals are illustrations, not a replacement for live dashboard data.

Do not present illustrative values as current project values.

## EXISTING CONTENT PROTECTION

Module 01 and Module 02 must remain unchanged.

The supplied `ollaMasteryModules.ts` combines:

`existing modules + CEO_COST_CONTROL_MASTERY`

Do not copy existing modules into a new file and do not rewrite them.

## ACCESSIBILITY / RESPONSIVENESS

Preserve:

- `aria-expanded`
- existing answer reveal
- current keyboard navigation
- current responsive breakpoints
- current reduced-motion support

New visuals must:

- remain readable at mobile width
- not create horizontal page overflow
- include semantic figure captions
- provide accessible SVG labels where applicable
- avoid tiny unreadable text

## TESTING

Update the existing question-count test from 24 to 66 total questions while preserving the current checks for Modules 01 and 02.

Add the supplied visual wiring test.

Then run:

```bash
npm test
npm run build
```

If any test or TypeScript/build issue appears, fix the implementation without changing the supplied learning content or existing trick-layer behavior.

## ACCEPTANCE CHECKLIST

Do not stop until all are true:

1. Existing Eng. OLLA access still works exactly as before.
2. Opening animation and existing look are unchanged.
3. Module 01 is unchanged.
4. Module 02 is unchanged.
5. Module 03 appears after Module 02.
6. Module 03 contains all 42 supplied questions.
7. Max 3 questions per page is preserved.
8. Every Module 03 question has a visual illustration.
9. Visuals inherit the same font/background/style as the existing Eng. OLLA layer.
10. No live X/Y project values were invented.
11. Existing return-to-dashboard control works.
12. Session progress still works.
13. Mobile layout has no horizontal overflow.
14. `npm test` passes.
15. `npm run build` passes.

Finally report only:
- files added
- files modified
- test result
- build result
- any implementation note that materially affects behavior
