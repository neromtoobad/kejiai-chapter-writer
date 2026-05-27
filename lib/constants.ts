/**
 * KejiAI — global constants.
 *
 * Anything that drives statistical decisions, APA formatting, or
 * level-calibrated prompting lives here. Single source of truth.
 */

import type {
  ChapterTarget,
  LikertDecision,
  LikertScalePoints,
  ResearchLevel,
} from "@/types";

/** Citation/formatting style used across every generated chapter. */
export const APA_STYLE = "APA 7" as const;

/** Default institution string used when the intake form leaves it blank. */
export const DEFAULT_INSTITUTION = "the institution" as const;

/** Default Likert resolution if the user does not pick one. */
export const DEFAULT_LIKERT_POINTS: LikertScalePoints = 5;

/**
 * Decision threshold for each Likert scale.
 * A mean greater than or equal to the threshold is "Agreed".
 */
export const LIKERT_THRESHOLDS: Record<LikertScalePoints, number> = {
  4: 2.5,
  5: 3.5,
  7: 4.5,
};

/** Human-readable labels for the research levels. */
export const LEVEL_LABELS: Record<ResearchLevel, string> = {
  undergraduate: "Undergraduate",
  masters: "Master's",
  phd: "PhD",
  journal: "Journal Article",
};

/** Whether effect sizes are required at a given level. */
export const LEVEL_REQUIRES_EFFECT_SIZE: Record<ResearchLevel, boolean> = {
  undergraduate: false,
  masters: true,
  phd: true,
  journal: true,
};

/** Whether IMRaD structure is enforced at a given level. */
export const LEVEL_REQUIRES_IMRAD: Record<ResearchLevel, boolean> = {
  undergraduate: false,
  masters: false,
  phd: true,
  journal: true,
};

/** Per-chapter section blueprint. Drives the prompt builder. */
export const CHAPTER_STRUCTURE: Record<Exclude<ChapterTarget, "all">, {
  title: string;
  sections: string[];
}> = {
  "1": {
    title: "Introduction",
    sections: [
      "Background to the Study",
      "Statement of the Problem",
      "Objectives of the Study",
      "Research Questions",
      "Hypotheses",
      "Significance of the Study",
      "Scope and Limitations",
      "Definition of Terms",
      "Organization of the Study",
    ],
  },
  "2": {
    title: "Literature Review",
    sections: [
      "Conceptual Framework",
      "Theoretical Framework",
      "Empirical Review",
      "Gap in Literature",
      "Summary",
    ],
  },
  "3": {
    title: "Methodology",
    sections: [
      "Research Design",
      "Population and Sample",
      "Sampling Technique",
      "Research Instrument",
      "Validity and Reliability",
      "Data Collection Procedure",
      "Method of Data Analysis",
    ],
  },
  "4": {
    title: "Data Presentation and Analysis",
    sections: [
      "4.1 Introduction",
      "4.2 Demographic Profile",
      "4.3 Analysis per Objective",
      "4.x Hypothesis Testing",
    ],
  },
  "5": {
    title: "Summary, Conclusion and Recommendations",
    sections: [
      "5.1 Introduction",
      "5.2 Summary of Findings",
      "5.3 Conclusion",
      "5.4 Recommendations",
      "5.5 Limitations",
      "5.6 Suggestions for Further Studies",
    ],
  },
};

/** Ordered tab labels for the chapter selector. */
export const CHAPTER_TARGET_LABELS: Record<ChapterTarget, string> = {
  "1": "Chapter 1",
  "2": "Chapter 2",
  "3": "Chapter 3",
  "4": "Chapter 4",
  "5": "Chapter 5",
  all: "All Chapters",
};

/**
 * Likert response labels and their numeric ranges.
 * Used for parsing user data and labeling Chapter 4 tables.
 */
export interface DecisionLabel {
  /** Short code used in Chapter 4 table headers. */
  code: "SD" | "D" | "N" | "A" | "SA";
  /** Full response label. */
  label: string;
  /** Numeric value carried by this response in a 5-point Likert. */
  value: number;
  /** Inclusive mean range this label applies to. */
  range: [number, number];
}

/**
 * 5-point Likert labels with the canonical mean-range mapping.
 * Range boundaries are inclusive of the lower bound.
 */
export const DECISION_LABELS_5PT: readonly DecisionLabel[] = [
  { code: "SD", label: "Strongly Disagree", value: 1, range: [1.0, 1.49] },
  { code: "D", label: "Disagree", value: 2, range: [1.5, 2.49] },
  { code: "N", label: "Neutral", value: 3, range: [2.5, 3.49] },
  { code: "A", label: "Agree", value: 4, range: [3.5, 4.49] },
  { code: "SA", label: "Strongly Agree", value: 5, range: [4.5, 5.0] },
] as const;

/** Compact "Agreed / Disagreed" decision applied at the item level. */
export const LIKERT_DECISION: Record<"agreed" | "disagreed", LikertDecision> = {
  agreed: "Agreed",
  disagreed: "Disagreed",
};

/** Hard limits used across upload + parse paths. */
export const FILE_LIMITS = {
  /** Maximum upload size in bytes (5 MB). */
  maxBytes: 5 * 1024 * 1024,
  /** Allowed MIME types and extensions for upload. */
  acceptedExtensions: [".csv", ".xlsx", ".xls"] as const,
};

/** Streaming targets — these are SLOs, not just preferences. */
export const STREAMING_TARGETS = {
  /** Maximum acceptable time-to-first-token from the generate route. */
  firstTokenMs: 3_000,
  /** Hard cap on a single generate call. Mirrored in vercel.json. */
  hardTimeoutMs: 90_000,
};

/** Claude model used for all generation. */
export const CLAUDE_MODEL = "claude-sonnet-4-20250514" as const;

/**
 * Per-IP rate limits. The generate window is conservative because each call
 * burns Claude output tokens — that's the only endpoint that costs money.
 * Override at deploy time via `RATE_LIMIT_GENERATE_PER_HOUR`.
 */
export const RATE_LIMITS = {
  generate: {
    limit: Number(process.env.RATE_LIMIT_GENERATE_PER_HOUR ?? 10),
    windowMs: 60 * 60 * 1000,
  },
} as const;
