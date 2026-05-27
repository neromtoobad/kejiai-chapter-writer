/**
 * Numerical verification of /lib/computeStats.ts against hand-computed
 * reference values. Run with:
 *
 *   npx tsx scripts/test-stats.ts
 *
 * Exits non-zero on any failed assertion.
 */

import {
  chi2CDF,
  chiSquare,
  cronbachAlpha,
  descriptive,
  fCDF,
  likertSummary,
  linearRegression,
  oneWayANOVA,
  pearsonR,
  tCDF,
  tTest,
} from "../lib/computeStats";
import type { LikertItem } from "../types";

let pass = 0;
let fail = 0;

function approx(actual: number, expected: number, tol: number, label: string) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    console.error(
      `  FAIL ${label}: expected ${expected} (±${tol}), got ${actual}`,
    );
    fail++;
  } else {
    console.log(`  pass ${label}: ${actual} ≈ ${expected}`);
    pass++;
  }
}

function eq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    console.error(`  FAIL ${label}: expected ${expected}, got ${actual}`);
    fail++;
  } else {
    console.log(`  pass ${label}: ${actual}`);
    pass++;
  }
}

// ---------------------------------------------------------------------------
// Distribution CDFs — anchor against known textbook values
// ---------------------------------------------------------------------------
console.log("\n[distributions]");
// t(0, 10) = 0.5
approx(tCDF(0, 10), 0.5, 1e-6, "tCDF(0, 10) == 0.5");
// t(2.228, 10) ≈ 0.975 (Student's t crit value at α=0.025 one-sided, df=10)
approx(tCDF(2.228, 10), 0.975, 1e-3, "tCDF(2.228, 10) ≈ 0.975");
// chi2(3.841, 1) ≈ 0.95
approx(chi2CDF(3.841, 1), 0.95, 1e-3, "chi2CDF(3.841, 1) ≈ 0.95");
// F(3.84, 5, 10) ≈ 0.9657 — anchored by R's pf(3.84, 5, 10)
approx(fCDF(3.84, 5, 10), 0.9657, 2e-3, "fCDF(3.84, 5, 10) ≈ 0.966");

// ---------------------------------------------------------------------------
// descriptive
// ---------------------------------------------------------------------------
console.log("\n[descriptive]");
// col = [2, 4, 4, 4, 5, 5, 7, 9]
//   mean = 5, var(n-1) = 32/7 ≈ 4.5714, SD ≈ 2.13809
const d = descriptive([2, 4, 4, 4, 5, 5, 7, 9]);
eq(d.n, 8, "descriptive.n");
approx(d.mean, 5.0, 1e-9, "descriptive.mean");
approx(d.sd, 2.138089935299, 1e-6, "descriptive.sd");
eq(d.min, 2, "descriptive.min");
eq(d.max, 9, "descriptive.max");
// Skewness (SPSS): n/((n-1)(n-2)) * Σ((x-μ)/σ)³
//   Σ d³ where d=(x-5): -27 + (-1) + (-1) + (-1) + 0 + 0 + 8 + 64 = 42
//   skew = (8/(7*6)) * (42 / σ³) = 0.190476 * (42 / 9.7711) = 0.190476 * 4.2984 ≈ 0.8187
approx(d.skewness ?? NaN, 0.8187, 1e-3, "descriptive.skewness ≈ 0.819");

// ---------------------------------------------------------------------------
// pearsonR — Anscombe's quartet I
// ---------------------------------------------------------------------------
console.log("\n[pearsonR]");
const xA = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
const yA = [
  8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68,
];
const pr = pearsonR(xA, yA);
approx(pr.r, 0.8164, 1e-3, "Anscombe I: r ≈ 0.8164");
eq(pr.df, 9, "Anscombe I: df == 9");
// p < 0.005 for this correlation
if (pr.p < 0.005) {
  console.log(`  pass Anscombe I: p < 0.005 (${pr.p})`);
  pass++;
} else {
  console.error(`  FAIL Anscombe I: expected p < 0.005, got ${pr.p}`);
  fail++;
}

// Perfect correlation
const ppr = pearsonR([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
approx(ppr.r, 1.0, 1e-9, "perfect r == 1");

// ---------------------------------------------------------------------------
// likertSummary — manual reference
// ---------------------------------------------------------------------------
console.log("\n[likertSummary]");
const items: LikertItem[] = [
  { sn: 1, item: "i1", sd: 0, d: 0, n: 0, a: 0, sa: 0, mean: 3.6, sdValue: 0, decision: "Agreed" },
  { sn: 2, item: "i2", sd: 0, d: 0, n: 0, a: 0, sa: 0, mean: 3.4, sdValue: 0, decision: "Agreed" },
  { sn: 3, item: "i3", sd: 0, d: 0, n: 0, a: 0, sa: 0, mean: 4.0, sdValue: 0, decision: "Disagreed" },
  { sn: 4, item: "i4", sd: 0, d: 0, n: 0, a: 0, sa: 0, mean: 3.8, sdValue: 0, decision: "Disagreed" },
  { sn: 5, item: "i5", sd: 0, d: 0, n: 0, a: 0, sa: 0, mean: 3.2, sdValue: 0, decision: "Agreed" },
];
const lk = likertSummary(items, 3.5);
// grand = (3.6+3.4+4.0+3.8+3.2)/5 = 18/5 = 3.6
approx(lk.grandMean, 3.6, 1e-12, "likert grand mean == 3.6");
eq(lk.decision, "Agreed", "likert grand decision == Agreed");
eq(lk.items[0].decision, "Agreed", "i1 decision (3.6 ≥ 3.5)");
eq(lk.items[1].decision, "Disagreed", "i2 decision (3.4 < 3.5)");
eq(lk.items[2].decision, "Agreed", "i3 decision (4.0 ≥ 3.5)");
eq(lk.items[3].decision, "Agreed", "i4 decision (3.8 ≥ 3.5)");
eq(lk.items[4].decision, "Disagreed", "i5 decision (3.2 < 3.5)");

// ---------------------------------------------------------------------------
// tTest — Welch's, known case
// ---------------------------------------------------------------------------
console.log("\n[tTest]");
const tA = [5, 7, 5, 3, 5, 3, 3, 9];
const tB = [8, 1, 4, 6, 6, 4, 1, 2];
const tt = tTest(tA, tB);
// mean A = 5, mean B = 4
approx(tt.meanA, 5.0, 1e-9, "tTest meanA");
approx(tt.meanB, 4.0, 1e-9, "tTest meanB");
// var A = (0+4+0+4+0+4+4+16)/7 = 32/7 ≈ 4.571
// var B = (16+9+0+4+4+0+9+4)/7 = 46/7 ≈ 6.571
// se = sqrt(4.571/8 + 6.571/8) = sqrt(0.5714 + 0.8214) = sqrt(1.3929) ≈ 1.1802
// t = (5 - 4) / 1.1802 ≈ 0.8473
approx(tt.t, 0.8473, 1e-3, "tTest t ≈ 0.847");
// Welch df:
//   num = (0.5714 + 0.8214)² = 1.3929² = 1.9402
//   den = 0.5714²/7 + 0.8214²/7 = 0.04665 + 0.09636 = 0.14301
//   df = 1.9402 / 0.14301 ≈ 13.567
approx(tt.df, 13.567, 1e-2, "tTest Welch df ≈ 13.57");
// pooled var = (7*4.571 + 7*6.571) / 14 = (32 + 46)/14 = 78/14 = 5.571
// pooled SD ≈ 2.3604
// Cohen's d = 1 / 2.3604 ≈ 0.4237
approx(tt.cohenD, 0.4237, 1e-3, "tTest Cohen's d ≈ 0.424");

// ---------------------------------------------------------------------------
// chiSquare — 2x2 textbook table
// ---------------------------------------------------------------------------
console.log("\n[chiSquare]");
const cs = chiSquare([
  [10, 20],
  [20, 30],
]);
// Expected:
//   E11=11.25, E12=18.75, E21=18.75, E22=31.25
//   χ² = 1.5625/11.25 + 1.5625/18.75 + 1.5625/18.75 + 1.5625/31.25
//      = 0.13889 + 0.08333 + 0.08333 + 0.05
//      = 0.35556
approx(cs.chi2, 0.35556, 1e-4, "chi² ≈ 0.3556");
eq(cs.df, 1, "chi² df == 1");
eq(cs.n, 80, "chi² N == 80");
// Cramér's V = sqrt(0.3556 / 80) ≈ 0.0667
approx(cs.cramersV, 0.0667, 1e-3, "Cramér's V ≈ 0.067");

// ---------------------------------------------------------------------------
// oneWayANOVA — known means
// ---------------------------------------------------------------------------
console.log("\n[oneWayANOVA]");
const an = oneWayANOVA([
  [15, 18, 22, 25, 30],
  [22, 25, 28, 30, 35],
  [30, 32, 35, 38, 40],
]);
// SSB ≈ 423.33, SSW = 304, F ≈ 8.355
approx(an.F, 8.355, 1e-2, "ANOVA F ≈ 8.355");
eq(an.df1, 2, "ANOVA df1 == 2");
eq(an.df2, 12, "ANOVA df2 == 12");
// η² = SSB / (SSB+SSW) = 423.33 / 727.33 ≈ 0.582
approx(an.etaSq, 0.582, 1e-3, "ANOVA η² ≈ 0.582");

// ---------------------------------------------------------------------------
// linearRegression — single predictor hand-computed
// ---------------------------------------------------------------------------
console.log("\n[linearRegression]");
const reg = linearRegression(
  [[1], [2], [3], [4], [5]],
  [2, 4, 5, 4, 5],
);
// β₀ = 2.2, β₁ = 0.6, R² = 0.6
approx(reg.coefficients[0].beta, 2.2, 1e-9, "regression intercept");
approx(reg.coefficients[1].beta, 0.6, 1e-9, "regression slope");
approx(reg.r2, 0.6, 1e-9, "regression R²");
approx(reg.sse, 2.4, 1e-9, "regression SSE");
approx(reg.sst, 6.0, 1e-9, "regression SST");
eq(reg.dfResidual, 3, "regression dfResidual");

// ---------------------------------------------------------------------------
// cronbachAlpha — 3-item reference (hand-computed)
// ---------------------------------------------------------------------------
console.log("\n[cronbachAlpha]");
const alpha = cronbachAlpha([
  [5, 4, 4, 3, 5],
  [4, 4, 3, 3, 4],
  [5, 3, 3, 4, 5],
]);
// item vars (n-1): 0.7, 0.3, 1.0 → sum 2.0
// totals: 14, 11, 10, 10, 14; var(n-1) = 16.8/4 = 4.2
// α = (3/2) * (1 - 2.0/4.2) = 1.5 * 0.5238095 ≈ 0.7857143
approx(alpha, 0.7857143, 1e-3, "Cronbach α ≈ 0.7857 (±0.01)");

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
