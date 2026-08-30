# Eng. OLLA CEO Cost-Control Mastery — Codex Handoff

This package is designed to be handed directly to Codex.

## Add
- `src/lib/ollaCeoMasteryContent.ts`
- `src/lib/ollaCeoVisuals.ts`
- `src/lib/ollaMasteryModules.ts`
- `src/components/OllaMasteryVisual.tsx`

## Patch
- Follow `patches/PATCH_EngOllaMastery.txt`
- Append `patches/APPEND_globals.css`
- Follow `patches/PATCH_tests.txt`

## Then give Codex
Use `CODEX_PROMPT.md` as the implementation instruction.

The code deliberately:
- preserves existing Module 01 and 02
- does not alter the hidden/trick-layer access mechanism
- inherits the existing font and black/gold background
- uses no third-party chart library
- does not hard-code live X/Y project data
- provides visual illustrations for Module 03
