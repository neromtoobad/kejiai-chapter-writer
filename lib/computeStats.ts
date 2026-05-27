/**
 * KejiAI — descriptive and inferential statistics.
 *
 * No third-party stats library. Distribution CDFs use Numerical Recipes
 * approximations (incomplete beta and gamma). Conventions:
 *
 *   - Sample variance / SD use (n-1) in the denominator.
 *   - Skewness and kurtosis use the SPSS / Excel sample formulas.
 *   - t-test is Welch's (unequal variance) — robust default for survey data.
 *   - Cohen's d uses the pooled SD.
 *   - Chi-square is Pearson's; Cramér's V uses min(r-1, c-1).
 *   - ANOVA returns eta-squared.
 *   - OLS regression always fits an intercept.
 */

import type {
  AnovaResult,
  ChiSquareResult,
  DescriptiveStats,
  LikertDecision,
  LikertItem,
  LikertTable,
  PearsonResult,
  RegressionCoefficient,
  RegressionResult,
  TTestResult,
} from "@/types";
import { LIKERT_DECISION } from "./constants";

// ===========================================================================
// 1. Distribution helpers (Numerical Recipes)
// ===========================================================================

/** Log-gamma via Lanczos approximation. Domain: x > 0. */
function gammaln(x: number): number {
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Continued fraction for the incomplete beta function (Numerical Recipes). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) -
      gammaln(a) -
      gammaln(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Series form of the regularised lower incomplete gamma function. */
function gser(a: number, x: number): number {
  const ITMAX = 200;
  const EPS = 3e-12;
  const gln = gammaln(a);
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

/** Continued-fraction form of the regularised upper incomplete gamma. */
function gcf(a: number, x: number): number {
  const ITMAX = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const gln = gammaln(a);
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Regularised lower incomplete gamma γ(a, x) / Γ(a). */
function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new Error("gammp: invalid arguments");
  if (x === 0) return 0;
  if (x < a + 1) return gser(a, x);
  return 1 - gcf(a, x);
}

/** Cumulative distribution function for Student's t with `df` degrees of freedom. */
export function tCDF(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const Ix = betai(df / 2, 0.5, x);
  return t >= 0 ? 1 - 0.5 * Ix : 0.5 * Ix;
}

/** Cumulative distribution function for the F distribution. */
export function fCDF(f: number, df1: number, df2: number): number {
  if (f <= 0) return 0;
  if (!Number.isFinite(f)) return 1;
  const x = df2 / (df2 + df1 * f);
  return 1 - betai(df2 / 2, df1 / 2, x);
}

/** Cumulative distribution function for the chi-square distribution. */
export function chi2CDF(x: number, df: number): number {
  if (x <= 0) return 0;
  return gammp(df / 2, x / 2);
}

// ===========================================================================
// 2. Linear algebra helpers (small, dense — OLS only)
// ===========================================================================

function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  const T: number[][] = Array.from({ length: n }, () =>
    new Array(m).fill(0),
  );
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) T[j][i] = A[i][j];
  }
  return T;
}

function matmul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = A[0]?.length ?? 0;
  const n = B[0]?.length ?? 0;
  if (B.length !== k) throw new Error("matmul: dim mismatch");
  const C: number[][] = Array.from({ length: m }, () =>
    new Array(n).fill(0),
  );
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let p = 0; p < k; p++) s += A[i][p] * B[p][j];
      C[i][j] = s;
    }
  }
  return C;
}

function matvec(A: number[][], v: number[]): number[] {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  if (v.length !== n) throw new Error("matvec: dim mismatch");
  const r = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[i][j] * v[j];
    r[i] = s;
  }
  return r;
}

/** In-place-style Gauss-Jordan inversion with partial pivoting. */
function inverse(A: number[][]): number[][] {
  const n = A.length;
  if (A.some((row) => row.length !== n)) {
    throw new Error("inverse: matrix must be square");
  }
  const M: number[][] = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    let maxAbs = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxAbs) {
        maxAbs = Math.abs(M[k][i]);
        pivotRow = k;
      }
    }
    if (maxAbs < 1e-12) {
      throw new Error("inverse: matrix is singular");
    }
    if (pivotRow !== i) {
      [M[i], M[pivotRow]] = [M[pivotRow], M[i]];
    }
    const pivot = M[i][i];
    for (let j = 0; j < 2 * n; j++) M[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  return M.map((row) => row.slice(n));
}

// ===========================================================================
// 3. Descriptive statistics
// ===========================================================================

/**
 * Descriptive stats for a numeric column. Filters non-finite values.
 *
 * Uses sample (n-1) variance. Skewness and kurtosis follow the SPSS/Excel
 * sample formulas — they match what a student would see in their stats
 * homework software.
 */
export function descriptive(col: number[]): DescriptiveStats {
  const vals = col.filter((v) => Number.isFinite(v));
  const n = vals.length;
  if (n === 0) {
    return {
      n: 0,
      mean: NaN,
      sd: NaN,
      min: NaN,
      max: NaN,
      skewness: null,
      kurtosis: null,
    };
  }
  let sum = 0;
  let min = vals[0];
  let max = vals[0];
  for (const v of vals) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  if (n < 2) {
    return { n, mean, sd: 0, min, max, skewness: null, kurtosis: null };
  }
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  for (const v of vals) {
    const d = v - mean;
    const d2 = d * d;
    s2 += d2;
    s3 += d2 * d;
    s4 += d2 * d2;
  }
  const variance = s2 / (n - 1);
  const sd = Math.sqrt(variance);
  let skewness: number | null = null;
  let kurtosis: number | null = null;
  if (n >= 3 && sd > 0) {
    skewness = (n / ((n - 1) * (n - 2))) * (s3 / Math.pow(sd, 3));
  }
  if (n >= 4 && sd > 0) {
    const a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
    const b = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    kurtosis = a * (s4 / Math.pow(sd, 4)) - b;
  }
  return { n, mean, sd, min, max, skewness, kurtosis };
}

// ===========================================================================
// 4. Likert summary
// ===========================================================================

/** Map a mean to its "Agreed" / "Disagreed" decision against `threshold`. */
export function decideFromMean(
  mean: number,
  threshold: number,
): LikertDecision {
  return mean >= threshold ? LIKERT_DECISION.agreed : LIKERT_DECISION.disagreed;
}

/**
 * Aggregate pre-computed Likert items into a table:
 *
 *   - Recompute per-item decision from each item's mean against the threshold.
 *   - Grand mean is the unweighted average of item means.
 *   - Grand decision is derived from the grand mean.
 *
 * This matches the Chapter 4 "S/N | Item | SD | D | N | A | SA | Mean | SD | Decision"
 * format defined in CLAUDE.md.
 */
export function likertSummary(
  items: LikertItem[],
  threshold: number,
): LikertTable {
  if (items.length === 0) {
    return {
      items: [],
      grandMean: NaN,
      decision: LIKERT_DECISION.disagreed,
    };
  }
  const normalized: LikertItem[] = items.map((item) => ({
    ...item,
    decision: decideFromMean(item.mean, threshold),
  }));
  const sum = normalized.reduce((s, it) => s + it.mean, 0);
  const grandMean = sum / normalized.length;
  return {
    items: normalized,
    grandMean,
    decision: decideFromMean(grandMean, threshold),
  };
}

// ===========================================================================
// 5. Inferential tests
// ===========================================================================

/**
 * Pearson product-moment correlation. Filters pairs where either value is
 * non-finite. Requires at least 3 paired observations.
 */
export function pearsonR(x: number[], y: number[]): PearsonResult {
  if (x.length !== y.length) {
    throw new Error("pearsonR: x and y must have equal length");
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      pairs.push([x[i], y[i]]);
    }
  }
  const n = pairs.length;
  if (n < 3) {
    throw new Error("pearsonR: at least 3 paired observations required");
  }
  let sumX = 0;
  let sumY = 0;
  for (const [xi, yi] of pairs) {
    sumX += xi;
    sumY += yi;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let dxx = 0;
  let dyy = 0;
  for (const [xi, yi] of pairs) {
    const dx = xi - meanX;
    const dy = yi - meanY;
    num += dx * dy;
    dxx += dx * dx;
    dyy += dy * dy;
  }
  const df = n - 2;
  if (dxx === 0 || dyy === 0) {
    return { r: 0, p: 1, df };
  }
  const r = num / Math.sqrt(dxx * dyy);
  let p: number;
  if (Math.abs(r) >= 1) {
    p = 0;
  } else {
    const t = r * Math.sqrt(df / (1 - r * r));
    p = 2 * (1 - tCDF(Math.abs(t), df));
  }
  return { r, p, df };
}

/**
 * Welch's two-sample t-test with Cohen's d (pooled SD). Filters non-finite
 * values from each group independently.
 */
export function tTest(groupA: number[], groupB: number[]): TTestResult {
  const a = groupA.filter((v) => Number.isFinite(v));
  const b = groupB.filter((v) => Number.isFinite(v));
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) {
    throw new Error("tTest: each group needs at least 2 observations");
  }
  const meanA = a.reduce((s, v) => s + v, 0) / nA;
  const meanB = b.reduce((s, v) => s + v, 0) / nB;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);
  const se = Math.sqrt(varA / nA + varB / nB);
  const meanDiff = meanA - meanB;
  if (se === 0) {
    return {
      t: 0,
      df: nA + nB - 2,
      p: 1,
      cohenD: 0,
      meanA,
      meanB,
      meanDiff,
      nA,
      nB,
    };
  }
  const t = meanDiff / se;
  const df =
    Math.pow(varA / nA + varB / nB, 2) /
    (Math.pow(varA / nA, 2) / (nA - 1) +
      Math.pow(varB / nB, 2) / (nB - 1));
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  const pooledVar =
    ((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2);
  const cohenD = pooledVar > 0 ? meanDiff / Math.sqrt(pooledVar) : 0;
  return { t, df, p, cohenD, meanA, meanB, meanDiff, nA, nB };
}

/**
 * Pearson chi-square test of independence on an r × c contingency table.
 * Returns χ², df, two-tailed p, Cramér's V, and the table total N.
 */
export function chiSquare(observed: number[][]): ChiSquareResult {
  const r = observed.length;
  if (r < 2) {
    throw new Error("chiSquare: at least 2 rows required");
  }
  const c = observed[0]?.length ?? 0;
  if (c < 2) {
    throw new Error("chiSquare: at least 2 columns required");
  }
  if (!observed.every((row) => row.length === c)) {
    throw new Error("chiSquare: ragged table");
  }
  const rowSums: number[] = observed.map((row) =>
    row.reduce((s, v) => s + v, 0),
  );
  const colSums: number[] = new Array(c).fill(0);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) colSums[j] += observed[i][j];
  }
  const N = rowSums.reduce((s, v) => s + v, 0);
  if (N === 0) {
    throw new Error("chiSquare: empty table");
  }
  let chi2 = 0;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const E = (rowSums[i] * colSums[j]) / N;
      if (E > 0) {
        chi2 += Math.pow(observed[i][j] - E, 2) / E;
      }
    }
  }
  const df = (r - 1) * (c - 1);
  const p = 1 - chi2CDF(chi2, df);
  const k = Math.min(r - 1, c - 1);
  const cramersV = k > 0 ? Math.sqrt(chi2 / (N * k)) : 0;
  return { chi2, df, p, cramersV, n: N };
}

/**
 * One-way analysis of variance across k ≥ 2 groups. Filters non-finite
 * values per group before computing.
 */
export function oneWayANOVA(groups: number[][]): AnovaResult {
  const cleaned = groups.map((g) => g.filter((v) => Number.isFinite(v)));
  const k = cleaned.length;
  if (k < 2) {
    throw new Error("oneWayANOVA: at least 2 groups required");
  }
  if (cleaned.some((g) => g.length < 1)) {
    throw new Error("oneWayANOVA: every group must have at least 1 observation");
  }
  const sizes = cleaned.map((g) => g.length);
  const N = sizes.reduce((s, v) => s + v, 0);
  if (N <= k) {
    throw new Error("oneWayANOVA: too few observations");
  }
  const means = cleaned.map(
    (g) => g.reduce((s, v) => s + v, 0) / g.length,
  );
  const grandMean =
    cleaned.flat().reduce((s, v) => s + v, 0) / N;
  let SSB = 0;
  for (let i = 0; i < k; i++) {
    SSB += sizes[i] * Math.pow(means[i] - grandMean, 2);
  }
  let SSW = 0;
  for (let i = 0; i < k; i++) {
    for (const v of cleaned[i]) SSW += Math.pow(v - means[i], 2);
  }
  const df1 = k - 1;
  const df2 = N - k;
  if (SSW === 0) {
    return { F: Infinity, df1, df2, p: 0, etaSq: 1 };
  }
  const F = SSB / df1 / (SSW / df2);
  const p = 1 - fCDF(F, df1, df2);
  const etaSq = SSB / (SSB + SSW);
  return { F, df1, df2, p, etaSq };
}

// ===========================================================================
// 6. OLS regression
// ===========================================================================

/**
 * Ordinary-least-squares linear regression with intercept.
 *
 * X is shape m × k (m observations, k predictors). Coefficients are returned
 * with an "Intercept" row followed by "X1"..."Xk" rows; callers may rename
 * the variables in the returned `RegressionResult.coefficients` array.
 */
export function linearRegression(
  X: number[][],
  y: number[],
): RegressionResult {
  const n = X.length;
  if (n === 0) throw new Error("linearRegression: empty X");
  if (y.length !== n) {
    throw new Error("linearRegression: y length does not match X rows");
  }
  const k = X[0]?.length ?? 0;
  if (k === 0) throw new Error("linearRegression: at least 1 predictor required");
  if (X.some((row) => row.length !== k)) {
    throw new Error("linearRegression: ragged X");
  }
  if (n <= k + 1) {
    throw new Error("linearRegression: insufficient observations");
  }
  const Xa = X.map((row) => [1, ...row]);
  const Xt = transpose(Xa);
  const XtX = matmul(Xt, Xa);
  const XtXinv = inverse(XtX);
  const XtY = matvec(Xt, y);
  const beta = matvec(XtXinv, XtY);

  let sse = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let j = 0; j <= k; j++) yhat += Xa[i][j] * beta[j];
    const e = y[i] - yhat;
    sse += e * e;
  }
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let sst = 0;
  for (const yi of y) sst += (yi - yMean) ** 2;
  const dfResidual = n - k - 1;
  const dfModel = k;
  const r2 = sst === 0 ? 0 : 1 - sse / sst;
  const adjustedR2 =
    sst === 0 ? 0 : 1 - ((1 - r2) * (n - 1)) / dfResidual;
  const sigma2 = sse / dfResidual;

  const names = [
    "Intercept",
    ...Array.from({ length: k }, (_, i) => `X${i + 1}`),
  ];
  const coefficients: RegressionCoefficient[] = [];
  for (let j = 0; j <= k; j++) {
    const variance = sigma2 * XtXinv[j][j];
    const se = variance > 0 ? Math.sqrt(variance) : 0;
    const t = se > 0 ? beta[j] / se : 0;
    const p = se > 0 ? 2 * (1 - tCDF(Math.abs(t), dfResidual)) : 1;
    coefficients.push({ variable: names[j], beta: beta[j], se, t, p });
  }

  let F = 0;
  let fPValue = 1;
  if (k > 0 && sst > 0) {
    if (sse === 0) {
      F = Infinity;
      fPValue = 0;
    } else {
      F = r2 / k / ((1 - r2) / dfResidual);
      fPValue = 1 - fCDF(F, k, dfResidual);
    }
  }

  return {
    coefficients,
    r2,
    adjustedR2,
    F,
    dfModel,
    dfResidual,
    fPValue,
    sse,
    sst,
    n,
  };
}

// ===========================================================================
// 7. Reliability — Cronbach's alpha
// ===========================================================================

/**
 * Cronbach's alpha for `items[i]` = responses of item i across N respondents.
 * All items must have the same length; respondents with any missing item are
 * dropped listwise (SPSS default).
 */
export function cronbachAlpha(items: number[][]): number {
  const k = items.length;
  if (k < 2) {
    throw new Error("cronbachAlpha: at least 2 items required");
  }
  const N = items[0]?.length ?? 0;
  if (!items.every((it) => it.length === N)) {
    throw new Error("cronbachAlpha: all items must have the same length");
  }
  const validIdx: number[] = [];
  for (let j = 0; j < N; j++) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (!Number.isFinite(items[i][j])) {
        ok = false;
        break;
      }
    }
    if (ok) validIdx.push(j);
  }
  if (validIdx.length < 2) {
    throw new Error("cronbachAlpha: fewer than 2 complete respondents");
  }

  let sumItemVars = 0;
  for (let i = 0; i < k; i++) {
    const vals = validIdx.map((j) => items[i][j]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    let s2 = 0;
    for (const v of vals) s2 += (v - mean) ** 2;
    sumItemVars += s2 / (vals.length - 1);
  }

  const totals = validIdx.map((j) => {
    let t = 0;
    for (let i = 0; i < k; i++) t += items[i][j];
    return t;
  });
  const totalMean = totals.reduce((s, v) => s + v, 0) / totals.length;
  let totalS2 = 0;
  for (const t of totals) totalS2 += (t - totalMean) ** 2;
  const totalVar = totalS2 / (totals.length - 1);
  if (totalVar === 0) return 0;

  return (k / (k - 1)) * (1 - sumItemVars / totalVar);
}
