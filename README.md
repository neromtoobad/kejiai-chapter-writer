# KejiAI

> **Real statistics. Real interpretation. No signup.**
>
> Upload your research data, describe the study, and receive a fully
> written, APA-formatted academic chapter — calibrated to Nigerian
> undergraduate, masters, or PhD conventions — in under 60 seconds.

KejiAI is a stateless web app for academic researchers. Students upload a
CSV / Excel survey file, fill a short intake form, map columns to objectives
and hypotheses, and the system streams a complete chapter back token-by-token
with real Pearson r, t-test, ANOVA, chi-square, and Cronbach's α values
computed from the uploaded data. Charts are auto-generated as embedded SVGs;
the chapter exports as `.md`, `.docx`, or PDF (browser print).

No accounts, no database, no payments. The dataset never leaves the request.

---

## Quick start

```bash
git clone https://github.com/<your-org>/kejiai-chapter-writer.git
cd kejiai-chapter-writer
npm install
# Create .env.local with: ANTHROPIC_API_KEY=sk-ant-…
npm run dev
```

Open <http://localhost:3000>.

### Verify the Claude connection

```bash
node --env-file=.env.local scripts/verify-claude.mjs
```

---

## How it works

```
User uploads CSV / Excel ──► POST /api/parse-data
                              ├─ papaparse / xlsx
                              ├─ computeStats() — descriptive stats
                              └─ returns { dataset, stats, rawTable }

User maps columns → objectives + hypotheses (in browser)

User clicks Generate ─────► POST /api/generate
                              ├─ rateLimit per IP
                              ├─ runAnalyses() — Cronbach α, Pearson r,
                              │     Welch's t, one-way ANOVA, chi-square
                              ├─ buildCharts() — chart specs as JSON
                              ├─ buildPrompt() — system + user prompts
                              │     with Nigerian academic style rules
                              └─ Anthropic SDK stream → text/plain
                                    ├─ ChapterViewer streams the markdown
                                    ├─ ```chart fences render via Recharts
                                    └─ Tables / headings / source lines
                                       rendered in Nigerian project format
```

---

## Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (editorial cream + amber accent)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`) with streaming
- **File parsing**: `xlsx` + `papaparse`
- **Charts**: `recharts` (client) + custom server-side spec generator
- **Markdown rendering**: `react-markdown` + `remark-gfm`
- **DOCX export**: `docx`
- **Rate limiting**: in-process token bucket (swap to Upstash for HA)
- **Deployment**: Vercel (`vercel.json` pins `maxDuration: 90` on /api/generate)

---

## What's implemented

- [x] CSV + Excel parsing with numeric / categorical column inference
- [x] Descriptive statistics — mean, SD, min, max, skewness, kurtosis (SPSS conventions)
- [x] Inferential statistics — Pearson r, Welch's t, one-way ANOVA, chi-square, OLS regression, Cronbach's α
- [x] User-driven mapping UI: objectives ↔ Likert items, hypotheses ↔ variable pairs
- [x] Server-side test inference (numeric × numeric → Pearson, cat × num → t / ANOVA, cat × cat → chi-square)
- [x] Streaming chapter generation via Anthropic SDK
- [x] Token-budget-controlled prompts (system ≤ 2000 tokens; total ≤ 4000)
- [x] Nigerian academic style: Decision Rule, "From Table 4.X above", "Source: Field Survey", REJECTED phrasing, Yamane's formula, British spelling, named-stakeholder recommendations
- [x] Auto-generated charts: demographic pies, Likert-item bar charts, scatter for Pearson, group bars for t / ANOVA
- [x] `.md`, `.docx` (with embedded chart PNGs), PDF (browser print) export
- [x] Per-IP rate limiting on `/api/generate`
- [x] Test scripts: `test-stats.ts`, `test-analyses.ts`, `test-prompt.ts`, `test-ratelimit.ts`

## Optional env vars

All of these are off until you set them. Add at Vercel deploy time.

| Variable | What it does |
|---|---|
| `WEB_SEARCH_ENABLED` | When `"true"`, enables Claude's `web_search` tool so citations come from real published papers instead of plausible training-time names. |
| `WEB_SEARCH_MAX_USES` | Cap on web searches per chapter (default `5`). |
| `RATE_LIMIT_GENERATE_PER_HOUR` | Per-IP cap on `/api/generate` (default `10`). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Switches the rate limiter to a distributed Redis-backed limiter. Highly recommended for any public deploy — the in-memory fallback only counts within a single serverless instance. |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Enables Sentry error tracking. Source maps upload requires the auth token. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Enables Plausible analytics. Set to your deployed domain. Tracks `file_parsed`, `generation_started`, `chapter_copied`, `chapter_exported`. |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT` | Override the script URL if you self-host Plausible (default `https://plausible.io/js/script.js`). |

## What's next

- [ ] Vector chart embedding in DOCX is shipped — modern Word uses the
      embedded SVG; older versions fall back to the PNG.
- [ ] Tests for the SVG export round-trip
- [ ] OG image + favicon refresh for the deployed domain

---

## Project layout

```
app/
  api/
    parse-data/      CSV/XLSX → dataset + descriptive stats
    generate/        Stream Claude → markdown
    export-docx/     Markdown + chart PNGs → .docx download
  page.tsx           Intake page (client) — Step 01 / 02 / 03 / generate
  generate/          (reserved for future dedicated generate route)
  layout.tsx         Inter + Playfair Display + Geist Mono
  globals.css        Cream palette + @media print

components/
  FileUpload.tsx        Drop zone + parse trigger
  StatsSummary.tsx      N, variables, Likert candidates
  AnalysisMapping.tsx   Map columns → objectives + hypotheses
  IntakeForm.tsx        Title, level, objectives, hypotheses, …
  ChapterViewer.tsx     Streaming markdown viewer + tabs + export buttons
  Chart.tsx             Recharts renderer + parseChartSpec()
  ui/                   shadcn primitives

lib/
  parseData.ts          CSV + XLSX parsers, type inference
  computeStats.ts       All statistical tests (no third-party stats lib)
  runAnalyses.ts        Routes mapped data into the right tests
  buildPrompt.ts        System + user prompts with Nigerian style rules
  buildCharts.ts        Chart specs (deterministic, no Claude tokens)
  exportDocx.ts         Markdown → Word doc with embedded PNGs
  ratelimit.ts          In-process token bucket
  constants.ts          Likert thresholds, APA style, chapter structure, etc.
  utils.ts              cn() helper

types/index.ts          All domain + result types

scripts/
  test-stats.ts         Numerical assertions (Anscombe, SPSS reference values, …)
  test-prompt.ts        Prompt-contract assertions
  test-analyses.ts      Analyses-engine assertions
  test-ratelimit.ts     Rate-limiter assertions
  verify-claude.mjs     One-call live check of the Anthropic SDK
```

---

## Deployment to Vercel

```bash
vercel env add ANTHROPIC_API_KEY production
vercel deploy --prod
```

`vercel.json` pins `maxDuration: 90` on `/api/generate` so the stream isn't
killed mid-chapter on the hobby plan.

For production rate limiting, set:

```bash
RATE_LIMIT_GENERATE_PER_HOUR=20    # default: 10
```

---

## License

Private — no license file. All rights reserved.
