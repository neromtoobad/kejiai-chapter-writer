# DESIGN_DECISIONS.md — KejiAI

Locked at the end of Phase 0. These decisions are the contract Phases 1–5 build against.

## Aesthetic
**Editorial dark.** Deep navy / slate base, warm amber accent, academic serif headings (Playfair Display), monospace for stats output.

Implementation:
- `html` defaults to `class="dark"` in `app/layout.tsx`.
- Slate base color via shadcn CSS variables (HSL).
- Fonts wired in `app/layout.tsx`:
  - Sans body: Inter (`--font-sans`)
  - Serif headings: Playfair Display (`--font-serif`)
  - Mono stats output: Geist Mono (`--font-mono`)

## Breakpoint Strategy
**Desktop-first, min-width 768px.** Layout assumes desktop; mobile falls back to single column.

## Chapter Generation Mode
**Tab view, generate individually.** When the user selects "All Chapters", the UI renders five tabs (Ch1–Ch5) and each chapter is generated on-demand. No pre-emptive batch generation.

## Streaming SLO
**First token ≤ 3 seconds from form submit.** Encoded in `STREAMING_TARGETS.firstTokenMs` in `lib/constants.ts`. Generate route hard-cap is 90 seconds (`STREAMING_TARGETS.hardTimeoutMs`, mirrored in `vercel.json` later).

## Output Download
**Markdown + copy-to-clipboard.** No PDF in v1. `.docx` export is Phase 5 / v2.
