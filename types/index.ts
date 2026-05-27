/**
 * KejiAI — shared type definitions.
 *
 * These are the contracts that span the parse layer, the prompt factory,
 * the streaming API, and the React UI. Keep them narrow and accurate.
 */

/** Academic calibration target for the generated chapter prose. */
export type ResearchLevel = "undergraduate" | "masters" | "phd" | "journal";

/** Which chapter the user wants generated. "all" emits the full 5-chapter run. */
export type ChapterTarget = "1" | "2" | "3" | "4" | "5" | "all";

/** Likert scale resolution used to compute per-item decisions. */
export type LikertScalePoints = 4 | 5 | 7;

/** Research instrument selected on the intake form. */
export type ResearchInstrument =
  | "questionnaire"
  | "interview"
  | "observation"
  | "secondary-data";

/** Decision label applied to a Likert item or grand mean. */
export type LikertDecision = "Agreed" | "Disagreed";

/** Full payload of the intake form. */
export interface IntakeFormData {
  /** Project / dissertation title. */
  title: string;
  /** Academic level — drives prompt calibration. */
  level: ResearchLevel;
  /** Institution name. Defaults to "the institution" when empty. */
  institution: string;
  /** Numbered list of research objectives, one per entry. */
  objectives: string[];
  /** Numbered list of null hypotheses (Ho), one per entry. */
  hypotheses: string[];
  /** Instrument used to collect the data. */
  instrument: ResearchInstrument;
  /** Sample size N. Auto-filled from parsed dataset when available. */
  sampleSize: number;
  /** 2–5 sentence description of the study. */
  description: string;
  /** Likert resolution — 4, 5, or 7-point. Defaults to 5. */
  likertPoints: LikertScalePoints;
  /** Which chapter to generate. */
  chapterTarget: ChapterTarget;
}

/** A single column's classification within the parsed dataset. */
export interface DatasetColumn {
  name: string;
  /** "numeric" if every non-null cell parses as a finite number. */
  type: "numeric" | "categorical";
}

/** Result of parsing an uploaded CSV/Excel file. */
export interface ParsedDataset {
  /** Column names in original order. */
  headers: string[];
  /** Row objects keyed by header. */
  rows: Record<string, string | number | null>[];
  /** Header names of numeric columns. */
  numerics: string[];
  /** Header names of categorical columns. */
  categoricals: string[];
  /** Row count (excludes header). */
  n: number;
}

/** Descriptive statistics for a single numeric variable. */
export interface StatResult {
  variable: string;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** Sample skewness. Null when n < 3 or SD is 0. */
  skewness: number | null;
  /** "Agreed" / "Disagreed" when the variable is part of a Likert cluster. */
  decision?: LikertDecision;
}

/** Full descriptive snapshot returned by `descriptive()`. */
export interface DescriptiveStats {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** Sample skewness (SPSS/Excel convention). Null when n < 3 or SD is 0. */
  skewness: number | null;
  /** Sample excess kurtosis (SPSS/Excel convention). Null when n < 4 or SD is 0. */
  kurtosis: number | null;
}

/** Pearson correlation coefficient with two-tailed p value. */
export interface PearsonResult {
  r: number;
  p: number;
  df: number;
}

/** Welch's t-test result with Cohen's d effect size. */
export interface TTestResult {
  t: number;
  df: number;
  p: number;
  cohenD: number;
  meanA: number;
  meanB: number;
  meanDiff: number;
  nA: number;
  nB: number;
}

/** Pearson chi-square test of independence with Cramér's V. */
export interface ChiSquareResult {
  chi2: number;
  df: number;
  p: number;
  cramersV: number;
  n: number;
}

/** One-way ANOVA with eta-squared effect size. */
export interface AnovaResult {
  F: number;
  df1: number;
  df2: number;
  p: number;
  etaSq: number;
}

/** A single coefficient row in a regression output table. */
export interface RegressionCoefficient {
  variable: string;
  beta: number;
  se: number;
  t: number;
  p: number;
}

/** OLS linear regression result. */
export interface RegressionResult {
  coefficients: RegressionCoefficient[];
  r2: number;
  adjustedR2: number;
  /** Overall F statistic for the model. */
  F: number;
  /** Numerator df — number of predictors (excluding intercept). */
  dfModel: number;
  /** Denominator df — n - k - 1. */
  dfResidual: number;
  /** Two-tailed p value for the overall F. */
  fPValue: number;
  /** Sum of squared residuals. */
  sse: number;
  /** Total sum of squares. */
  sst: number;
  n: number;
}

/* =========================================================================
 * Variable mapping + pre-computed analyses
 * =======================================================================*/

/** Statistical test inferred from the variable types of a hypothesis. */
export type HypothesisTestKind =
  | "none"
  | "pearson"
  | "ttest"
  | "anova"
  | "chisquare";

/** User-supplied mapping for one hypothesis (index aligned to `IntakeFormData.hypotheses`). */
export interface HypothesisSpec {
  hypothesisIndex: number;
  /** "none" leaves the chapter to insert an `[Insert: …]` marker. */
  kind: HypothesisTestKind;
  /** First variable — X for Pearson, group for t/ANOVA, row for chi-square. */
  varA?: string;
  /** Second variable — Y for Pearson, outcome for t/ANOVA, col for chi-square. */
  varB?: string;
}

/** Resolved hypothesis test wrapped in a discriminated union for the prompt builder. */
export interface HypothesisAnalysis {
  hypothesisIndex: number;
  hypothesisText: string;
  spec: HypothesisSpec;
  result?:
    | { kind: "pearson"; data: PearsonResult }
    | {
        kind: "ttest";
        data: TTestResult;
        groupLabelA: string;
        groupLabelB: string;
      }
    | { kind: "anova"; data: AnovaResult; groupLabels: string[] }
    | {
        kind: "chisquare";
        data: ChiSquareResult;
        rowLevels: string[];
        colLevels: string[];
      };
  /** Reason the test could not be run, when applicable. */
  error?: string;
}

/** Cronbach's α for one Likert cluster — keyed by objective. */
export interface ReliabilityResult {
  objectiveIndex: number;
  objectiveText: string;
  itemColumns: string[];
  /** Null when the cluster had < 2 items or insufficient complete responses. */
  alpha: number | null;
  itemCount: number;
  /** Respondents with complete data across the cluster. */
  n: number;
  /** Excellent / Good / Acceptable / Questionable / Poor / Unacceptable / Not computed */
  interpretation: string;
  error?: string;
}

/** Frontend → backend payload describing how columns map to objectives + hypotheses. */
export interface AnalysisMappings {
  /** objectiveIndex → list of Likert item column names. */
  objectives: Record<number, string[]>;
  /** hypothesisIndex → spec. */
  hypotheses: Record<number, HypothesisSpec>;
  /**
   * columnName → human-readable questionnaire item text.
   * Optional — when present, the model uses the wording in Chapter 4
   * Likert tables instead of the raw column name.
   */
  itemTexts?: Record<string, string>;
}

/** Bundled output of `runAnalyses()`, consumed by `buildPrompt`. */
export interface AnalysesBundle {
  reliability: ReliabilityResult[];
  hypotheses: HypothesisAnalysis[];
}

/* =========================================================================
 * Charts — server-generated specs, model copies fences, viewer renders.
 * =======================================================================*/

interface ChartCommon {
  /** Stable ID — drives DOM keys and DOCX/PDF rasterisation later. */
  id: string;
  /** Full caption like "Figure 4.1: Distribution of Respondents by Gender". */
  caption: string;
  /** Chapter section the chart belongs to (model uses this to place it). */
  section: string;
}

/** Categorical frequency distribution → pie chart. */
export interface PieChartSpec extends ChartCommon {
  kind: "pie";
  data: Array<{ label: string; value: number }>;
}

/** Likert item means per cluster → vertical bar chart. */
export interface BarChartSpec extends ChartCommon {
  kind: "bar";
  xLabel: string;
  yLabel: string;
  data: Array<{ category: string; value: number }>;
}

/** Group means for t-test/ANOVA → grouped bar chart. */
export interface GroupBarChartSpec extends ChartCommon {
  kind: "groupBar";
  xLabel: string;
  yLabel: string;
  data: Array<{ group: string; mean: number }>;
}

/** Two numeric vars for Pearson r → scatter plot. */
export interface ScatterChartSpec extends ChartCommon {
  kind: "scatter";
  xLabel: string;
  yLabel: string;
  data: Array<{ x: number; y: number }>;
}

export type ChartSpec =
  | PieChartSpec
  | BarChartSpec
  | GroupBarChartSpec
  | ScatterChartSpec;

/** One row in a Chapter 4 Likert table. */
export interface LikertItem {
  /** Serial number — typically the row index in the table. */
  sn: number;
  /** Item text shown in the questionnaire. */
  item: string;
  /** Count of "Strongly Disagree" responses. */
  sd: number;
  /** Count of "Disagree" responses. */
  d: number;
  /** Count of "Neutral" responses (5-pt and 7-pt scales only). */
  n: number;
  /** Count of "Agree" responses. */
  a: number;
  /** Count of "Strongly Agree" responses. */
  sa: number;
  /** Item mean. */
  mean: number;
  /** Item standard deviation. */
  sdValue: number;
  /** Decision derived from item mean against the threshold for the scale. */
  decision: LikertDecision;
}

/** A grouped Likert table — one per research objective. */
export interface LikertTable {
  items: LikertItem[];
  grandMean: number;
  decision: LikertDecision;
}
