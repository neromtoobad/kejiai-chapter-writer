/**
 * KejiAI — chart spec generator.
 *
 * Given the parsed dataset, the descriptive stats, the user's mappings, and
 * the pre-computed analyses bundle, this returns the list of figures that
 * should appear in Chapter 4. The model copies each fence verbatim into the
 * right section of the chapter; the viewer renders the spec via Recharts.
 *
 * We only generate charts when the target is Chapter 4 (or "all"). Other
 * chapters are largely text-based in Nigerian projects.
 */

import type {
  AnalysesBundle,
  AnalysisMappings,
  ChartSpec,
  ChapterTarget,
  IntakeFormData,
  ParsedDataset,
  StatResult,
} from "@/types";

const MAX_PIE_LEVELS = 10;
const MAX_SCATTER_POINTS = 200;

export function buildCharts(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  stats: StatResult[],
  mappings: AnalysisMappings | undefined,
  analyses: AnalysesBundle | undefined,
  chapterTarget: ChapterTarget,
): ChartSpec[] {
  // Charts apply to Chapter 4 only. For "all", they're emitted inside the
  // Chapter 4 block of the consolidated output.
  if (chapterTarget !== "4" && chapterTarget !== "all") return [];
  if (dataset.n === 0) return [];

  const charts: ChartSpec[] = [];
  let figIdx = 1;
  const nextId = () => `fig-4-${figIdx++}`;

  // 1. Demographic pies — one per usable categorical column.
  for (const col of dataset.categoricals) {
    const dist = countByLevel(dataset, col);
    if (dist.length < 2 || dist.length > MAX_PIE_LEVELS) continue;
    const id = nextId();
    charts.push({
      kind: "pie",
      id,
      caption: `Figure ${id.replace("fig-", "").replace("-", ".")}: Distribution of Respondents by ${humanize(col)}`,
      section: "4.2 Demographic Profile",
      data: dist.map((d) => ({ label: d.level, value: d.count })),
    });
  }

  // 2. Likert item-means bars — one per objective cluster from analyses.
  for (const r of analyses?.reliability ?? []) {
    const itemMeans = r.itemColumns
      .map((col) => stats.find((s) => s.variable === col))
      .filter((s): s is StatResult => !!s)
      .map((s) => ({ category: s.variable, value: round2(s.mean) }));
    if (itemMeans.length === 0) continue;
    const id = nextId();
    const objNum = r.objectiveIndex + 1;
    charts.push({
      kind: "bar",
      id,
      caption: `Figure ${id.replace("fig-", "").replace("-", ".")}: Mean Scores of Likert Items for Objective ${objNum} — ${truncate(r.objectiveText, 60)}`,
      section: `4.${2 + objNum} Objective ${objNum} (Likert analysis)`,
      xLabel: "Item",
      yLabel: "Mean (1–5)",
      data: itemMeans,
    });
  }

  // 3. Hypothesis charts — scatter for Pearson, group bar for t/ANOVA.
  for (const h of analyses?.hypotheses ?? []) {
    if (!h.result) continue;
    const hNum = h.hypothesisIndex + 1;
    const id = nextId();
    if (h.result.kind === "pearson" && h.spec.varA && h.spec.varB) {
      const points = pairsFromDataset(dataset, h.spec.varA, h.spec.varB);
      if (points.length === 0) continue;
      charts.push({
        kind: "scatter",
        id,
        caption: `Figure ${id.replace("fig-", "").replace("-", ".")}: Scatter Plot of ${humanize(h.spec.varA)} vs ${humanize(h.spec.varB)} (Hypothesis ${hNum})`,
        section: `Hypothesis ${hNum}`,
        xLabel: humanize(h.spec.varA),
        yLabel: humanize(h.spec.varB),
        data: points.slice(0, MAX_SCATTER_POINTS),
      });
    } else if (h.result.kind === "ttest") {
      charts.push({
        kind: "groupBar",
        id,
        caption: `Figure ${id.replace("fig-", "").replace("-", ".")}: Mean ${humanize(h.spec.varB ?? "outcome")} by ${humanize(h.spec.varA ?? "group")} (Hypothesis ${hNum})`,
        section: `Hypothesis ${hNum}`,
        xLabel: humanize(h.spec.varA ?? "group"),
        yLabel: `Mean ${humanize(h.spec.varB ?? "outcome")}`,
        data: [
          { group: h.result.groupLabelA, mean: round2(h.result.data.meanA) },
          { group: h.result.groupLabelB, mean: round2(h.result.data.meanB) },
        ],
      });
    } else if (h.result.kind === "anova") {
      // Group means come from the ANOVA result's labels + cleaned-group means
      // we can derive from the dataset using the same split logic.
      const groupMeans = anovaGroupMeans(
        dataset,
        h.spec.varA,
        h.spec.varB,
        h.result.groupLabels,
      );
      if (groupMeans.length === 0) continue;
      charts.push({
        kind: "groupBar",
        id,
        caption: `Figure ${id.replace("fig-", "").replace("-", ".")}: Mean ${humanize(h.spec.varB ?? "outcome")} by ${humanize(h.spec.varA ?? "group")} (Hypothesis ${hNum})`,
        section: `Hypothesis ${hNum}`,
        xLabel: humanize(h.spec.varA ?? "group"),
        yLabel: `Mean ${humanize(h.spec.varB ?? "outcome")}`,
        data: groupMeans,
      });
    }
    // Skip chi-square — a stacked or grouped bar is doable but adds complexity;
    // we cover that in a later batch when the export pipeline can handle them.
  }

  return charts;
}

// ===========================================================================
// Helpers
// ===========================================================================

function countByLevel(
  dataset: ParsedDataset,
  col: string,
): Array<{ level: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of dataset.rows) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count);
}

function pairsFromDataset(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const row of dataset.rows) {
    const a = row[varA];
    const b = row[varB];
    if (
      typeof a === "number" &&
      Number.isFinite(a) &&
      typeof b === "number" &&
      Number.isFinite(b)
    ) {
      out.push({ x: a, y: b });
    }
  }
  return out;
}

function anovaGroupMeans(
  dataset: ParsedDataset,
  varA: string | undefined,
  varB: string | undefined,
  labels: string[],
): Array<{ group: string; mean: number }> {
  if (!varA || !varB) return [];
  const groupCol = dataset.categoricals.includes(varA) ? varA : varB;
  const outcomeCol = groupCol === varA ? varB : varA;
  const buckets = new Map<string, number[]>();
  for (const row of dataset.rows) {
    const g = row[groupCol];
    const v = row[outcomeCol];
    if (g === null || g === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const key = String(g);
    const list = buckets.get(key) ?? [];
    list.push(v);
    buckets.set(key, list);
  }
  return labels
    .filter((l) => buckets.has(l))
    .map((l) => {
      const vals = buckets.get(l)!;
      const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
      return { group: l, mean: round2(mean) };
    });
}

/** Turn `e_learning_adopt1` / `adopt1` into "Adopt 1". Light cosmetic only. */
function humanize(s: string): string {
  const cleaned = s
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\D)(\d)/g, "$1 $2")
    .trim();
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function round2(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 100) / 100;
}
