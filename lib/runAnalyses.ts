/**
 * KejiAI — pre-computed analyses bundle.
 *
 * Given a parsed dataset, a flat `IntakeFormData`, and the user's variable
 * mappings, this produces the inputs the prompt builder needs to write
 * Chapter 4 with real numbers:
 *
 *   - Cronbach's α per objective Likert cluster
 *   - One hypothesis test per hypothesis spec, with the test auto-picked from
 *     the variable types (Pearson / t-test / ANOVA / chi-square)
 *
 * Tests live in `computeStats.ts`; this module just routes data into them.
 */

import {
  chiSquare,
  cronbachAlpha,
  oneWayANOVA,
  pearsonR,
  tTest,
} from "./computeStats";
import type {
  AnalysesBundle,
  AnalysisMappings,
  FrequencyDistribution,
  HypothesisAnalysis,
  HypothesisSpec,
  HypothesisTestKind,
  IntakeFormData,
  ParsedDataset,
  ReliabilityResult,
} from "@/types";

// ===========================================================================
// Public entry point
// ===========================================================================

export function runAnalyses(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  mappings: AnalysisMappings,
): AnalysesBundle {
  return {
    reliability: runReliability(intake, dataset, mappings),
    hypotheses: runHypotheses(intake, dataset, mappings),
    frequencies: runFrequencies(dataset),
  };
}

/**
 * Frequency distribution per categorical column. Drives Chapter 4.2 so
 * the model writes real demographic counts instead of `[Insert: …]`
 * placeholders. Sorted by count desc within each variable.
 */
function runFrequencies(dataset: ParsedDataset): FrequencyDistribution[] {
  if (dataset.n === 0) return [];
  return dataset.categoricals.map<FrequencyDistribution>((col) => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const row of dataset.rows) {
      const v = row[col];
      if (v === null || v === undefined) continue;
      const key = String(v).trim();
      if (key === "") continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
    const rows = Array.from(counts.entries())
      .map(([level, count]) => ({
        level,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return { variable: col, n: total, rows };
  });
}

/**
 * Pick the right test for a pair of variables based on their types in the
 * dataset. Used by the UI to show the inferred test live, and by the route
 * as a fallback when the spec doesn't pin a kind.
 */
export function inferTestKind(
  dataset: ParsedDataset,
  varA: string | undefined,
  varB: string | undefined,
): HypothesisTestKind {
  if (!varA || !varB) return "none";
  const aIsNumeric = dataset.numerics.includes(varA);
  const bIsNumeric = dataset.numerics.includes(varB);
  const aIsCat = dataset.categoricals.includes(varA);
  const bIsCat = dataset.categoricals.includes(varB);

  if (aIsNumeric && bIsNumeric) return "pearson";
  if (aIsCat && bIsCat) return "chisquare";
  if ((aIsCat && bIsNumeric) || (aIsNumeric && bIsCat)) {
    // group is the categorical column; choose t-test vs ANOVA by level count
    const groupCol = aIsCat ? varA : varB;
    const levelSet = new Set<string>();
    for (const row of dataset.rows) {
      const v = row[groupCol];
      if (v !== null && v !== undefined) levelSet.add(String(v));
    }
    if (levelSet.size === 2) return "ttest";
    if (levelSet.size >= 3) return "anova";
    return "none";
  }
  return "none";
}

/** Buckets for the standard α interpretation (Nunnally / George & Mallery). */
function interpretAlpha(alpha: number | null): string {
  if (alpha === null || !Number.isFinite(alpha)) return "Not computed";
  if (alpha >= 0.9) return "Excellent";
  if (alpha >= 0.8) return "Good";
  if (alpha >= 0.7) return "Acceptable";
  if (alpha >= 0.6) return "Questionable";
  if (alpha >= 0.5) return "Poor";
  return "Unacceptable";
}

// ===========================================================================
// Reliability
// ===========================================================================

function runReliability(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  mappings: AnalysisMappings,
): ReliabilityResult[] {
  const out: ReliabilityResult[] = [];
  intake.objectives.forEach((objectiveText, i) => {
    const itemColumns = (mappings.objectives[i] ?? []).filter((c) =>
      dataset.headers.includes(c),
    );
    if (itemColumns.length === 0) return;

    // Build row-aligned vectors of NaN-padded values; cronbachAlpha drops rows
    // with any NaN in the cluster (listwise deletion).
    const itemVectors: number[][] = itemColumns.map((col) =>
      dataset.rows.map((r) => {
        const v = r[col];
        return typeof v === "number" && Number.isFinite(v) ? v : NaN;
      }),
    );

    // Count complete respondents (no NaN across the cluster).
    let completeN = 0;
    if (itemVectors.length > 0) {
      const len = itemVectors[0].length;
      for (let j = 0; j < len; j++) {
        if (itemVectors.every((iv) => Number.isFinite(iv[j]))) completeN++;
      }
    }

    if (itemColumns.length < 2) {
      out.push({
        objectiveIndex: i,
        objectiveText,
        itemColumns,
        alpha: null,
        itemCount: itemColumns.length,
        n: completeN,
        interpretation: interpretAlpha(null),
        error: "At least 2 items are required to compute α.",
      });
      return;
    }

    let alpha: number | null = null;
    let error: string | undefined;
    try {
      alpha = cronbachAlpha(itemVectors);
    } catch (e) {
      error = e instanceof Error ? e.message : "α could not be computed";
    }

    out.push({
      objectiveIndex: i,
      objectiveText,
      itemColumns,
      alpha,
      itemCount: itemColumns.length,
      n: completeN,
      interpretation: interpretAlpha(alpha),
      error,
    });
  });
  return out;
}

// ===========================================================================
// Hypothesis tests
// ===========================================================================

function runHypotheses(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  mappings: AnalysisMappings,
): HypothesisAnalysis[] {
  return intake.hypotheses.map<HypothesisAnalysis>((hypothesisText, i) => {
    const userSpec: HypothesisSpec = mappings.hypotheses[i] ?? {
      hypothesisIndex: i,
      kind: "none",
    };
    // Auto-infer kind when "none" was left but vars are present.
    const kind: HypothesisTestKind =
      userSpec.kind === "none" && userSpec.varA && userSpec.varB
        ? inferTestKind(dataset, userSpec.varA, userSpec.varB)
        : userSpec.kind;
    const spec: HypothesisSpec = { ...userSpec, kind };

    const base: HypothesisAnalysis = {
      hypothesisIndex: i,
      hypothesisText,
      spec,
    };

    if (kind === "none") return base;

    try {
      const outcome = runOneTest(spec, dataset);
      return { ...base, ...outcome };
    } catch (e) {
      return {
        ...base,
        error: e instanceof Error ? e.message : "Test failed",
      };
    }
  });
}

function runOneTest(
  spec: HypothesisSpec,
  dataset: ParsedDataset,
): Pick<HypothesisAnalysis, "result" | "error"> {
  if (!spec.varA || !spec.varB) {
    return { error: "Both variables must be selected." };
  }
  if (!dataset.headers.includes(spec.varA)) {
    return { error: `Variable "${spec.varA}" is not in the dataset.` };
  }
  if (!dataset.headers.includes(spec.varB)) {
    return { error: `Variable "${spec.varB}" is not in the dataset.` };
  }

  switch (spec.kind) {
    case "pearson":
      return runPearson(dataset, spec.varA, spec.varB);
    case "ttest":
      return runTTestSpec(dataset, spec.varA, spec.varB);
    case "anova":
      return runAnovaSpec(dataset, spec.varA, spec.varB);
    case "chisquare":
      return runChiSquareSpec(dataset, spec.varA, spec.varB);
    case "none":
      return {};
  }
}

function runPearson(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): Pick<HypothesisAnalysis, "result" | "error"> {
  if (
    !dataset.numerics.includes(varA) ||
    !dataset.numerics.includes(varB)
  ) {
    return { error: "Pearson r requires two numeric variables." };
  }
  const pairs = rowPairs(dataset, varA, varB);
  if (pairs.x.length < 3) {
    return { error: "Pearson r requires at least 3 complete pairs." };
  }
  const data = pearsonR(pairs.x, pairs.y);
  return { result: { kind: "pearson", data } };
}

function runTTestSpec(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): Pick<HypothesisAnalysis, "result" | "error"> {
  // Resolve which is group (categorical) and which is outcome (numeric).
  const { groupCol, outcomeCol, error } = resolveGroupAndOutcome(
    dataset,
    varA,
    varB,
  );
  if (error) return { error };
  const buckets = splitByGroup(dataset, groupCol, outcomeCol);
  const labels = Array.from(buckets.keys());
  if (labels.length !== 2) {
    return {
      error: `t-test needs exactly 2 levels in "${groupCol}" (found ${labels.length}).`,
    };
  }
  const [a, b] = labels;
  const groupA = buckets.get(a)!;
  const groupB = buckets.get(b)!;
  if (groupA.length < 2 || groupB.length < 2) {
    return {
      error: "t-test needs at least 2 observations in each group.",
    };
  }
  const data = tTest(groupA, groupB);
  return {
    result: {
      kind: "ttest",
      data,
      groupLabelA: a,
      groupLabelB: b,
    },
  };
}

function runAnovaSpec(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): Pick<HypothesisAnalysis, "result" | "error"> {
  const { groupCol, outcomeCol, error } = resolveGroupAndOutcome(
    dataset,
    varA,
    varB,
  );
  if (error) return { error };
  const buckets = splitByGroup(dataset, groupCol, outcomeCol);
  if (buckets.size < 2) {
    return {
      error: `ANOVA needs at least 2 levels in "${groupCol}" (found ${buckets.size}).`,
    };
  }
  const labels = Array.from(buckets.keys());
  const groups = labels.map((l) => buckets.get(l)!);
  if (groups.some((g) => g.length < 1)) {
    return { error: "ANOVA needs at least 1 observation per group." };
  }
  const data = oneWayANOVA(groups);
  return {
    result: {
      kind: "anova",
      data,
      groupLabels: labels,
    },
  };
}

function runChiSquareSpec(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): Pick<HypothesisAnalysis, "result" | "error"> {
  if (
    !dataset.categoricals.includes(varA) ||
    !dataset.categoricals.includes(varB)
  ) {
    return { error: "Chi-square requires two categorical variables." };
  }
  const { table, rowLevels, colLevels } = contingency(
    dataset,
    varA,
    varB,
  );
  if (rowLevels.length < 2 || colLevels.length < 2) {
    return {
      error: "Chi-square needs at least 2 levels in each variable.",
    };
  }
  const data = chiSquare(table);
  return {
    result: {
      kind: "chisquare",
      data,
      rowLevels,
      colLevels,
    },
  };
}

// ===========================================================================
// Row-walking helpers
// ===========================================================================

function rowPairs(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const row of dataset.rows) {
    const a = row[varA];
    const b = row[varB];
    if (
      typeof a === "number" &&
      Number.isFinite(a) &&
      typeof b === "number" &&
      Number.isFinite(b)
    ) {
      x.push(a);
      y.push(b);
    }
  }
  return { x, y };
}

function resolveGroupAndOutcome(
  dataset: ParsedDataset,
  varA: string,
  varB: string,
): { groupCol: string; outcomeCol: string; error?: string } {
  const aIsCat = dataset.categoricals.includes(varA);
  const aIsNum = dataset.numerics.includes(varA);
  const bIsCat = dataset.categoricals.includes(varB);
  const bIsNum = dataset.numerics.includes(varB);

  if (aIsCat && bIsNum) {
    return { groupCol: varA, outcomeCol: varB };
  }
  if (bIsCat && aIsNum) {
    return { groupCol: varB, outcomeCol: varA };
  }
  return {
    groupCol: "",
    outcomeCol: "",
    error: "Need one categorical (group) and one numeric (outcome).",
  };
}

function splitByGroup(
  dataset: ParsedDataset,
  groupCol: string,
  outcomeCol: string,
): Map<string, number[]> {
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
  return buckets;
}

function contingency(
  dataset: ParsedDataset,
  rowCol: string,
  colCol: string,
): { table: number[][]; rowLevels: string[]; colLevels: string[] } {
  const rowLevelsSet = new Set<string>();
  const colLevelsSet = new Set<string>();
  for (const row of dataset.rows) {
    const r = row[rowCol];
    const c = row[colCol];
    if (r === null || r === undefined) continue;
    if (c === null || c === undefined) continue;
    rowLevelsSet.add(String(r));
    colLevelsSet.add(String(c));
  }
  const rowLevels = Array.from(rowLevelsSet).sort();
  const colLevels = Array.from(colLevelsSet).sort();
  const table: number[][] = rowLevels.map(() =>
    new Array(colLevels.length).fill(0),
  );
  const rowIndex = new Map(rowLevels.map((l, i) => [l, i]));
  const colIndex = new Map(colLevels.map((l, i) => [l, i]));
  for (const row of dataset.rows) {
    const r = row[rowCol];
    const c = row[colCol];
    if (r === null || r === undefined) continue;
    if (c === null || c === undefined) continue;
    const ri = rowIndex.get(String(r));
    const ci = colIndex.get(String(c));
    if (ri === undefined || ci === undefined) continue;
    table[ri][ci] += 1;
  }
  return { table, rowLevels, colLevels };
}
