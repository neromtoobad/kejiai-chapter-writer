/**
 * KejiAI — prompt factory.
 *
 * Two public functions:
 *
 *   buildSystemPrompt(level) — the role + rules + level calibration. Kept
 *   under 2000 tokens. Chapter-by-chapter section lists live in the user
 *   prompt (which already has them via CHAPTER_STRUCTURE) so the system
 *   prompt can stay focused on rules.
 *
 *   buildUserPrompt(intake, dataset, stats, chapterTarget) — emits five
 *   labelled blocks (RESEARCH CONTEXT / DATASET SUMMARY / COMPUTED
 *   STATISTICS / CHAPTER INSTRUCTION / LEVEL RULES) separated by `---`,
 *   ending with the canonical "Begin writing now…" line.
 *
 * Both outputs are markdown — pipe tables, hash headings, fenced spans.
 */

import {
  APA_STYLE,
  CHAPTER_STRUCTURE,
  DEFAULT_INSTITUTION,
  LEVEL_LABELS,
  LEVEL_REQUIRES_EFFECT_SIZE,
  LEVEL_REQUIRES_IMRAD,
  LIKERT_THRESHOLDS,
} from "./constants";
import type {
  AnalysesBundle,
  ChapterTarget,
  ChartSpec,
  HypothesisAnalysis,
  IntakeFormData,
  ParsedDataset,
  ReliabilityResult,
  ResearchInstrument,
  ResearchLevel,
  StatResult,
} from "@/types";

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Returns the chapter writer's system prompt, calibrated to `level`.
 * Embeds the immutable rules from CLAUDE.md, including the
 * "NEVER invent statistics" directive.
 */
export function buildSystemPrompt(level: ResearchLevel): string {
  const levelLabel = LEVEL_LABELS[level];
  return [
    `You are KejiAI, an academic chapter writer. You produce ${APA_STYLE} formatted dissertation, thesis, and journal-article chapters — calibrated to the writer's level. Your output goes directly into a student's submission without further editing, so the academic register, citation discipline, and numerical accuracy must be publication-grade.`,
    ``,
    `## Non-Negotiable Rules`,
    ``,
    `1. **NEVER invent statistics.** If a numeric value cannot be taken directly from the COMPUTED STATISTICS block in the user message, output \`[Insert: <what is needed>]\` instead of a fabricated number. Fabricated statistics are unacceptable under any circumstance — they are the single fastest way to fail academic review.`,
    `2. **Use only the statistics provided.** Do not recompute, paraphrase, or extrapolate numbers. If a hypothesis test result is missing from the user message, write \`[Insert: <test type> required — provide statistic, df, p, and effect size]\` rather than guessing.`,
    `3. **${APA_STYLE} throughout.** Use author–date in-text citations: (Surname, Year). Multiple citations: (Surname, Year; Surname, Year). Page numbers for direct quotes only. Use the most plausible real authors and years; never cite "[Author, Year]" or placeholder citations — if uncertain, attribute to a named seminal source in the field.`,
    `4. **Markdown output.** \`#\` for the chapter heading, \`##\` for major sections (e.g. 4.1, 4.2…), \`###\` for sub-sections. **Bold** for emphasis. Pipe tables for every data table. No HTML, no code blocks (except when quoting a formula).`,
    `5. **Begin with \`# Chapter <N> — <Title>\`.** No preamble. No "Here is your chapter." No meta-commentary, no greetings, no acknowledgements. Output the chapter text directly.`,
    `6. **Hypotheses are tested as null hypotheses (Ho).** When testing one: state Ho verbatim → name the test → present results in a table → state the decision (reject / fail to reject Ho) → interpret in 2–3 sentences.`,
    ``,
    `## Writing Discipline`,
    ``,
    `- Full academic sentences in body prose. Bullets only for definitions, numbered recommendations, and option lists.`,
    `- Tables use GFM pipe syntax. Every table has a header row and a separator row. Numeric cells use two decimals; use more only when meaningful precision demands it (e.g. p-values < 0.001).`,
    `- For Chapter 4 Likert tables, use exactly these columns: \`S/N | Item | SD | D | N | A | SA | Mean | SD | Decision\`. State the decision rule once per analysis section.`,
    `- Cite the literature liberally. Mix conceptual definitions, theoretical lenses, and empirical findings. Avoid leaning on a single author.`,
    `- If a value, citation, or test result is genuinely missing, insert \`[Insert: <what is needed>]\`. Never guess. Never fabricate.`,
    ``,
    `## Nigerian Academic Style (Non-Negotiable)`,
    ``,
    `You are writing for a Nigerian university, polytechnic, or college of education. The output must read like a competently-written Nigerian undergraduate, masters, or PhD project — that's how it will be marked.`,
    ``,
    `**Voice and register**`,
    `- Third-person formal. Refer to the author as "the researcher" (e.g. "The researcher administered the questionnaire…"). Never "I", "we", "us", or "our".`,
    `- British spelling throughout: behaviour, organisation, analyse, programme, judgement, learnt, modelled, theorised, fulfilment.`,
    `- Lean on formal academic connectors: **Therefore**, **Furthermore**, **Moreover**, **Hence**, **Thus**, **In view of the above**, **Notwithstanding**, **In addition**, **More so**, **As such**, **Consequently**.`,
    `- Common interpretation phrases: "From Table X above, it can be seen that…", "The result indicates…", "The result implies…", "It was observed that…", "The findings of this study revealed that…", "This finding is consistent with…", "This finding contradicts the position of…".`,
    `- Avoid contractions ("do not", not "don't"; "it is", not "it's"). Avoid first-person pronouns. Avoid casual transitions ("So,", "Now,", "Anyway").`,
    ``,
    `**Tables and figures — STRICT format**`,
    `- Every Chapter 4 table is preceded by a numbered caption on its own line, then a blank line, then the pipe table:`,
    `  \`\`\``,
    `  **Table 4.1: Demographic Profile of Respondents**`,
    ``,
    `  | … |`,
    `  \`\`\``,
    `- Every table ends with a source line on the next paragraph: \`*Source: Field Survey, <year>*\` (use the current year if unknown).`,
    `- Figures use the same convention with "Figure 4.1: …" / "*Source: Field Survey, <year>*".`,
    `- Tables and figures are numbered sequentially within each chapter (Table 4.1, 4.2, 4.3; Figure 4.1, 4.2…).`,
    ``,
    `**Chapter 4 hypothesis testing patterns**`,
    `- Before each test, state the decision rule on its own line:`,
    `  **Decision Rule:** Reject H₀ if the p-value is less than 0.05; otherwise, fail to reject H₀.`,
    `- After the test, state the decision in the canonical Nigerian form:`,
    `  Since the p-value (\`<value>\`) is **less than** 0.05 level of significance, the null hypothesis is **REJECTED**.`,
    `  — or —`,
    `  Since the p-value (\`<value>\`) is **greater than** 0.05 level of significance, the null hypothesis is **NOT REJECTED** (i.e. failed to be rejected).`,
    ``,
    `**Chapter 5 recommendations**`,
    `- Each recommendation is a numbered point that opens with a named stakeholder:`,
    `  1. The university management should…`,
    `  2. Lecturers are encouraged to…`,
    `  3. Students should…`,
    `  4. The government / policy-makers should…`,
    `  5. Future researchers should…`,
    `- "Limitations" lists 3–5 concrete limits in 1–2 sentences each.`,
    `- "Suggestions for Further Studies" items open with "Future researchers should…" or "It is recommended that further studies…".`,
    ``,
    `**Reference conventions**`,
    `- ${APA_STYLE} format, but where the topic permits cite Nigerian or African scholars alongside the international canon (e.g. Adeyemo, Eze, Akinwale, Obi, Okolie, Adesina, Ajayi, Olu, Akinpelu, Tella, Nwosu). Federal Ministry of Education (FME), National Universities Commission (NUC), Central Bank of Nigeria (CBN), and World Bank are appropriate institutional citations for Nigerian context.`,
    ``,
    `## Charts and Figures`,
    ``,
    `When the user message contains a section titled "## Charts to Insert", each chart there is presented as a fenced code block labelled \`chart\`:`,
    ``,
    `    \`\`\`chart`,
    `    {"id":"fig-4-1","kind":"pie","section":"4.2 Demographic Profile","caption":"Figure 4.1: …","data":[…]}`,
    `    \`\`\``,
    ``,
    `- Copy the entire fence — backticks, language tag, JSON, closing backticks — **verbatim** into the chapter at the section indicated by the spec's \`section\` field, **immediately after** the relevant table or paragraph.`,
    `- Do not modify the JSON. Do not strip the fence. Do not summarise it. The viewer renders the chart from the JSON; any edit breaks the render.`,
    `- The caption line above the fence (e.g. **Figure 4.1: …**) should be written by you in markdown bold ON ITS OWN LINE just before the fence, so the chapter reads naturally.`,
    `- After the fence, write the standard source line on its own line: \`*Source: Field Survey, <year>*\`.`,
    ``,
    `## Level Calibration`,
    ``,
    `Audience: **${levelLabel}**`,
    ``,
    levelGuidance(level),
    ``,
    `Write at the upper edge of the audience's expectations — clear, rigorous, and academically credible.`,
  ].join("\n");
}

/**
 * Returns the structured user message: RESEARCH CONTEXT, DATASET SUMMARY,
 * COMPUTED STATISTICS, CHAPTER INSTRUCTION, LEVEL RULES — and the
 * canonical closing line.
 */
export function buildUserPrompt(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  stats: StatResult[],
  chapterTarget: ChapterTarget,
  analyses?: AnalysesBundle,
  charts?: ChartSpec[],
): string {
  const blocks = [
    researchContextBlock(intake, dataset),
    datasetSummaryBlock(dataset),
    computedStatisticsBlock(stats, analyses),
    chapterInstructionBlock(chapterTarget, intake, analyses),
    levelRulesBlock(intake.level),
  ];
  if (charts && charts.length > 0) {
    blocks.push(chartsBlock(charts));
  }
  blocks.push(`Begin writing now. Do not summarise. Do not ask questions.`);
  return blocks.join("\n\n---\n\n");
}

/** Convenience: build both prompts in one call. */
export function buildPrompt(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  stats: StatResult[],
  chapterTarget: ChapterTarget,
  analyses?: AnalysesBundle,
  charts?: ChartSpec[],
): { system: string; user: string } {
  return {
    system: buildSystemPrompt(intake.level),
    user: buildUserPrompt(
      intake,
      dataset,
      stats,
      chapterTarget,
      analyses,
      charts,
    ),
  };
}

// ===========================================================================
// Block builders
// ===========================================================================

function researchContextBlock(
  intake: IntakeFormData,
  dataset: ParsedDataset,
): string {
  const institution = intake.institution.trim() || DEFAULT_INSTITUTION;
  const effectiveN =
    dataset.n > 0
      ? dataset.n
      : intake.sampleSize > 0
        ? intake.sampleSize
        : null;
  const threshold = LIKERT_THRESHOLDS[intake.likertPoints];

  const lines: string[] = [
    `# RESEARCH CONTEXT`,
    ``,
    `**Title:** ${intake.title || "[Insert: research title]"}`,
    `**Level:** ${LEVEL_LABELS[intake.level]}`,
    `**Institution:** ${institution}`,
    `**Instrument:** ${instrumentLabel(intake.instrument)}`,
    `**Sample Size (N):** ${effectiveN ?? "[Insert: sample size]"}`,
    `**Likert Scale:** ${intake.likertPoints}-point (decision threshold: mean ≥ ${threshold.toFixed(2)} = Agreed)`,
  ];

  if (intake.description.trim()) {
    lines.push(``, `## Description`, ``, intake.description.trim());
  }

  lines.push(``, `## Objectives`, ``);
  if (intake.objectives.length === 0) {
    lines.push(`[Insert: research objectives]`);
  } else {
    intake.objectives.forEach((obj, i) => {
      const text = obj.trim();
      const alreadyNumbered = /^\d+[.):]\s*/.test(text);
      lines.push(alreadyNumbered ? text : `${i + 1}. ${text}`);
    });
  }

  lines.push(``, `## Hypotheses`, ``);
  if (intake.hypotheses.length === 0) {
    lines.push(`No hypotheses specified for this study.`);
  } else {
    intake.hypotheses.forEach((h, i) => {
      const text = h.trim();
      const alreadyPrefixed = /^H[o0]?\s*\d+/i.test(text);
      lines.push(alreadyPrefixed ? text : `Ho${i + 1}: ${text}`);
    });
  }

  return lines.join("\n");
}

function datasetSummaryBlock(dataset: ParsedDataset): string {
  const lines: string[] = [`# DATASET SUMMARY`, ``];
  if (dataset.n === 0) {
    lines.push(
      `No data file uploaded. Write this chapter from the research context alone. For any data-dependent claim, insert \`[Insert: <what is needed from the data>]\` rather than guess.`,
    );
    return lines.join("\n");
  }
  lines.push(
    `**Rows (N):** ${dataset.n}`,
    `**Total Variables:** ${dataset.headers.length}`,
    `**Numeric Columns (${dataset.numerics.length}):** ${dataset.numerics.length > 0 ? dataset.numerics.map(cell).join(", ") : "—"}`,
    `**Categorical Columns (${dataset.categoricals.length}):** ${dataset.categoricals.length > 0 ? dataset.categoricals.map(cell).join(", ") : "—"}`,
    ``,
    `| # | Variable | Type |`,
    `|---|---|---|`,
  );
  dataset.headers.forEach((h, i) => {
    const type = dataset.numerics.includes(h) ? "numeric" : "categorical";
    lines.push(`| ${i + 1} | ${cell(h)} | ${type} |`);
  });
  return lines.join("\n");
}

function computedStatisticsBlock(
  stats: StatResult[],
  analyses?: AnalysesBundle,
): string {
  const lines: string[] = [`# COMPUTED STATISTICS`, ``];
  if (stats.length === 0 && !analyses) {
    lines.push(
      `No descriptive statistics have been computed (no numeric data available). For any quantitative claim in the chapter, insert \`[Insert: <statistic required>]\`.`,
    );
    return lines.join("\n");
  }

  if (stats.length > 0) {
    lines.push(
      `## Descriptive Statistics`,
      ``,
      `| Variable | Mean | SD | Min | Max | Skewness | Decision |`,
      `|---|---|---|---|---|---|---|`,
    );
    for (const s of stats) {
      lines.push(
        `| ${cell(s.variable)} | ${fmt(s.mean, 2)} | ${fmt(s.sd, 2)} | ${fmtRange(s.min)} | ${fmtRange(s.max)} | ${fmt(s.skewness, 3)} | ${s.decision ?? "—"} |`,
      );
    }

    const likertItems = stats.filter((s) => s.decision !== undefined);
    if (likertItems.length > 0) {
      const grandMean =
        likertItems.reduce((sum, it) => sum + it.mean, 0) / likertItems.length;
      lines.push(
        ``,
        `## Likert Items Detected`,
        ``,
        `${likertItems.length} numeric variable${likertItems.length === 1 ? " was" : "s were"} flagged as Likert candidates. The unweighted grand mean across these items is **${grandMean.toFixed(2)}**.`,
      );
    }
  }

  if (analyses && analyses.reliability.length > 0) {
    lines.push(``, reliabilityBlock(analyses.reliability));
  }

  if (analyses && analyses.hypotheses.length > 0) {
    lines.push(``, hypothesisTestsBlock(analyses.hypotheses));
  }

  lines.push(
    ``,
    `Use the values above verbatim when writing the chapter. Do not invent additional cells, frequencies, or percentages — if a frequency count is needed and not provided, insert \`[Insert: <frequency required>]\`.`,
  );

  return lines.join("\n");
}

function reliabilityBlock(reliability: ReliabilityResult[]): string {
  const lines: string[] = [
    `## Reliability — Cronbach's α (per objective Likert cluster)`,
    ``,
    `| # | Objective | Items | n | α | Interpretation |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const r of reliability) {
    const items = r.itemColumns.map(cell).join(", ") || "—";
    const alpha =
      r.alpha === null || r.alpha === undefined ? "—" : r.alpha.toFixed(3);
    lines.push(
      `| ${r.objectiveIndex + 1} | ${cell(truncate(r.objectiveText, 60))} | ${items} | ${r.n} | ${alpha} | ${r.interpretation} |`,
    );
  }
  const withError = reliability.filter((r) => r.error);
  if (withError.length > 0) {
    lines.push(``, `_Notes:_`);
    for (const r of withError) {
      lines.push(
        `- Objective ${r.objectiveIndex + 1}: ${r.error}`,
      );
    }
  }
  lines.push(
    ``,
    `Report α in Chapter 3 (Validity and Reliability) using the values above. Do not recompute or round differently.`,
  );
  return lines.join("\n");
}

function hypothesisTestsBlock(hypotheses: HypothesisAnalysis[]): string {
  const lines: string[] = [
    `## Hypothesis Test Results`,
    ``,
    `Each hypothesis was tested using the variables mapped on the intake form. Reproduce these numbers exactly in Chapter 4 — do not recompute.`,
    ``,
  ];
  for (const h of hypotheses) {
    lines.push(`### Ho${h.hypothesisIndex + 1}`);
    lines.push(``);
    lines.push(`**Hypothesis:** ${h.hypothesisText}`);
    if (h.spec.kind === "none" && !h.result) {
      lines.push(
        `**Test:** not specified.`,
        `_Insert \`[Insert: <test type> required — provide statistic, df, p, and effect size]\` in the chapter sub-section for this hypothesis._`,
      );
      lines.push(``);
      continue;
    }
    lines.push(`**Mapped variables:** ${h.spec.varA ?? "—"} × ${h.spec.varB ?? "—"}`);
    lines.push(`**Test:** ${testLabel(h.spec.kind)}`);
    if (h.error) {
      lines.push(``, `_Error:_ ${h.error}`);
      lines.push(
        `_Insert \`[Insert: ${testLabel(h.spec.kind)} required — provide statistic, df, p, and effect size]\` in the chapter sub-section._`,
        ``,
      );
      continue;
    }
    if (!h.result) {
      lines.push(``);
      continue;
    }
    lines.push(``, ...resultLines(h));
    lines.push(``);
  }
  return lines.join("\n");
}

function resultLines(h: HypothesisAnalysis): string[] {
  if (!h.result) return [];
  const r = h.result;
  switch (r.kind) {
    case "pearson":
      return [
        `**Result:**`,
        ``,
        `| Statistic | Value |`,
        `|---|---|`,
        `| r | ${r.data.r.toFixed(3)} |`,
        `| df | ${r.data.df} |`,
        `| p (two-tailed) | ${formatPValue(r.data.p)} |`,
        ``,
        `**Decision:** ${pDecision(r.data.p)} the null hypothesis.`,
      ];
    case "ttest":
      return [
        `**Groups:** ${cell(r.groupLabelA)} (n = ${r.data.nA}) vs ${cell(r.groupLabelB)} (n = ${r.data.nB})`,
        ``,
        `| Statistic | Value |`,
        `|---|---|`,
        `| Mean (${cell(r.groupLabelA)}) | ${r.data.meanA.toFixed(2)} |`,
        `| Mean (${cell(r.groupLabelB)}) | ${r.data.meanB.toFixed(2)} |`,
        `| t | ${r.data.t.toFixed(3)} |`,
        `| df (Welch) | ${r.data.df.toFixed(2)} |`,
        `| p (two-tailed) | ${formatPValue(r.data.p)} |`,
        `| Cohen's d | ${r.data.cohenD.toFixed(3)} |`,
        ``,
        `**Decision:** ${pDecision(r.data.p)} the null hypothesis.`,
      ];
    case "anova":
      return [
        `**Groups:** ${r.groupLabels.map(cell).join(", ")}`,
        ``,
        `| Statistic | Value |`,
        `|---|---|`,
        `| F | ${r.data.F.toFixed(3)} |`,
        `| df₁ | ${r.data.df1} |`,
        `| df₂ | ${r.data.df2} |`,
        `| p | ${formatPValue(r.data.p)} |`,
        `| η² | ${r.data.etaSq.toFixed(3)} |`,
        ``,
        `**Decision:** ${pDecision(r.data.p)} the null hypothesis.`,
      ];
    case "chisquare":
      return [
        `**Contingency:** ${r.rowLevels.length} × ${r.colLevels.length} (rows: ${r.rowLevels.map(cell).join(", ")}; cols: ${r.colLevels.map(cell).join(", ")})`,
        ``,
        `| Statistic | Value |`,
        `|---|---|`,
        `| χ² | ${r.data.chi2.toFixed(3)} |`,
        `| df | ${r.data.df} |`,
        `| N | ${r.data.n} |`,
        `| p | ${formatPValue(r.data.p)} |`,
        `| Cramér's V | ${r.data.cramersV.toFixed(3)} |`,
        ``,
        `**Decision:** ${pDecision(r.data.p)} the null hypothesis.`,
      ];
  }
}

function testLabel(kind: HypothesisAnalysis["spec"]["kind"]): string {
  switch (kind) {
    case "pearson":
      return "Pearson r";
    case "ttest":
      return "Welch's t-test";
    case "anova":
      return "One-way ANOVA";
    case "chisquare":
      return "Chi-square test of independence";
    case "none":
      return "—";
  }
}

function pDecision(p: number): string {
  return p < 0.05 ? "Reject" : "Fail to reject";
}

function formatPValue(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function chapterInstructionBlock(
  target: ChapterTarget,
  intake: IntakeFormData,
  analyses?: AnalysesBundle,
): string {
  const lines: string[] = [`# CHAPTER INSTRUCTION`, ``];

  if (target === "all") {
    lines.push(
      `Write all five chapters in order. Each starts with its own \`# Chapter <N> — <Title>\` heading and follows the section structure below. Separate chapters with a horizontal rule (\`---\`).`,
      ``,
    );
    (["1", "2", "3", "4", "5"] as const).forEach((t) => {
      const spec = CHAPTER_STRUCTURE[t];
      lines.push(`## Chapter ${t} — ${spec.title}`);
      spec.sections.forEach((s) => lines.push(`- ${s}`));
      lines.push(``);
    });
  } else {
    const spec = CHAPTER_STRUCTURE[target];
    lines.push(
      `Write **Chapter ${target} — ${spec.title}**. Required sections, in order:`,
      ``,
    );
    spec.sections.forEach((s) => lines.push(`- ${s}`));

    if (target === "1") {
      lines.push(
        ``,
        `Section headers follow Nigerian convention: "Background **to** the Study" (not "Background of"), "Statement of **the** Problem", "Operational Definition of Terms" (not just "Definition of Terms"). Quote objectives verbatim from RESEARCH CONTEXT. Pair every objective with a research question. Include hypotheses verbatim under section 1.5 if provided in RESEARCH CONTEXT; otherwise state that the study is descriptive.`,
        ``,
        `Significance of the Study identifies named beneficiary groups (students, lecturers, university management, policy-makers, future researchers) and a one-sentence benefit per group.`,
      );
    } else if (target === "2") {
      lines.push(
        ``,
        `Define every key construct in the title and objectives. Apply at least one named theory in the theoretical framework. The empirical review should have one sub-section per objective, citing at least three prior studies per sub-section. Cite Nigerian/African scholars where the topic permits. Data-dependent claims are not expected.`,
      );
    } else if (target === "3") {
      lines.push(
        ``,
        `Describe the design, population, sampling, instrument, validity/reliability, procedure, and analytical methods. For sample size determination, explicitly use Taro Yamane's formula \`n = N / (1 + N(e²))\` (or Krejcie & Morgan table) and show the calculation if a population N is available. Validity must name all three types: face, content, and construct. Reliability must report Cronbach's α with the rule of thumb that **α ≥ 0.70 is acceptable**. Cite established methodological sources (Cohen, Manion & Morrison; Creswell; Fraenkel & Wallen; Asika; Nworgu) where appropriate.`,
      );
    } else if (target === "4") {
      const hypoCount = intake.hypotheses.length;
      const mappedHypoCount =
        analyses?.hypotheses.filter((h) => h.result && !h.error).length ?? 0;
      const clusterCount = analyses?.reliability.length ?? 0;
      lines.push(
        ``,
        `Build the analysis sections from the COMPUTED STATISTICS block. Open Chapter 4 with section **4.1 Introduction** (one short paragraph stating what the chapter covers), then **4.2 Demographic Profile of Respondents** (one or two frequency tables for categorical demographics like gender, age band, faculty, etc.).`,
        ``,
        `For each research objective, create a dedicated section (4.3, 4.4, …). Open each with the objective restated verbatim, e.g. **"Research Question 1: <objective text>"**. When a Likert cluster exists for that objective, name the specific items in prose and present a numbered table with the caption **"Table 4.X: <Cluster Description>"** above and **"*Source: Field Survey, ${new Date().getFullYear()}*"** below. The table uses the exact columns \`S/N | Item | SD | D | N | A | SA | Mean | SD | Decision\` filled from the per-item descriptive stats. State the grand mean and decision against the threshold.`,
        ``,
        `After every Likert table write a "From Table 4.X above…" interpretation paragraph that walks the reader through the highest-mean and lowest-mean items and the grand-mean decision.`,
      );
      if (clusterCount > 0) {
        lines.push(
          ``,
          `${clusterCount} Likert cluster${clusterCount === 1 ? " has" : "s have"} been pre-computed. Cite the Cronbach's α value for each cluster in section 3.5 (Validity and Reliability) — use the exact value from the Reliability table.`,
        );
      }
      if (hypoCount > 0) {
        lines.push(
          ``,
          mappedHypoCount > 0
            ? `${mappedHypoCount} of ${hypoCount} hypothesis test${mappedHypoCount === 1 ? " has" : "s have"} been pre-computed. For each hypothesis create a sub-section under **4.${4 + clusterCount + 1} Hypothesis Testing**:`
            : `For each of the ${hypoCount} hypothes${hypoCount === 1 ? "is" : "es"} in RESEARCH CONTEXT, create a sub-section under **4.${4 + clusterCount + 1} Hypothesis Testing**:`,
          ``,
          `  1. **H₀<N>:** restate the null hypothesis verbatim.`,
          `  2. **Decision Rule:** Reject H₀ if p-value < 0.05; otherwise fail to reject.`,
          `  3. Present the test in a numbered table: **"Table 4.X: <Test name> for H₀<N>"** above, **"*Source: Researcher's Computation, ${new Date().getFullYear()}*"** below.`,
          `  4. State the decision in canonical Nigerian phrasing: *"Since the p-value (\`<value>\`) is less than 0.05 level of significance, the null hypothesis is **REJECTED**."* (or "**NOT REJECTED**" / "failed to be rejected" if p ≥ 0.05).`,
          `  5. Interpret in 2–3 sentences. Compare with at least one prior empirical study.`,
          ``,
          mappedHypoCount > 0
            ? `For any hypothesis without a pre-computed result, insert \`[Insert: <test type> required — provide statistic, df, p, and effect size]\` in place of the table values.`
            : `If a hypothesis test result is missing from COMPUTED STATISTICS, write \`[Insert: <test type> required — provide statistic, df, p, and effect size]\` rather than fabricate values.`,
        );
      } else {
        lines.push(
          ``,
          `This study has no formal hypotheses. Focus on objective-level Likert analysis and descriptive interpretation.`,
        );
      }
    } else if (target === "5") {
      lines.push(
        ``,
        `Open with **5.1 Introduction** (one short paragraph summarising the study's scope). **5.2 Summary of Findings** uses one numbered paragraph per objective or hypothesis, each starting with the objective/hypothesis restated. **5.3 Conclusion** is 3–5 paragraphs opening with "In view of the findings of this study…" or "From the foregoing analyses…". `,
        ``,
        `**5.4 Recommendations** is a numbered list. Each item opens with a named stakeholder and is traceable to a specific finding: "The university management should…", "Lecturers are encouraged to…", "Students should…", "The government / policy-makers should…", "Future researchers should…". 4–6 items total.`,
        ``,
        `**5.5 Limitations** lists 3–5 concrete limits in 1–2 sentences each. **5.6 Suggestions for Further Studies** items open with "Future researchers should…" or "It is recommended that further studies…".`,
      );
    }
  }

  return lines.join("\n");
}

function chartsBlock(charts: ChartSpec[]): string {
  const lines: string[] = [
    `# CHARTS TO INSERT`,
    ``,
    `Each chart below has been generated from the uploaded data. Copy the entire fenced \`chart\` block — backticks, language tag, JSON, closing backticks — VERBATIM into the chapter at the section noted in its \`section\` field. Precede each fence with a bolded caption line (e.g. \`**Figure 4.1: …**\`) and follow it with \`*Source: Field Survey, ${new Date().getFullYear()}*\`.`,
    ``,
  ];
  for (const c of charts) {
    lines.push(`### ${c.caption}`);
    lines.push(`**Place in:** ${c.section}`);
    lines.push("");
    lines.push("```chart");
    lines.push(JSON.stringify(c));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

function levelRulesBlock(level: ResearchLevel): string {
  const yn = (b: boolean) => (b ? "Yes" : "No");
  return [
    `# LEVEL RULES`,
    ``,
    `- Level: **${LEVEL_LABELS[level]}**`,
    `- Effect sizes required: ${yn(LEVEL_REQUIRES_EFFECT_SIZE[level])}`,
    `- IMRaD structure: ${yn(LEVEL_REQUIRES_IMRAD[level])}`,
    `- Citation style: ${APA_STYLE}`,
  ].join("\n");
}

// ===========================================================================
// Helpers
// ===========================================================================

function levelGuidance(level: ResearchLevel): string {
  switch (level) {
    case "undergraduate":
      return "Clear, accessible academic English. Prefer the plain word over jargon when meaning is unchanged. 2–4 citations per major concept. Effect sizes welcomed but not required. Avoid heavy epistemological positioning; let the data and the cited literature do the work.";
    case "masters":
      return "Theory-grounded prose, methodologically explicit. Effect sizes are **required** for every inferential test — report Cohen's d, η², Cramér's V, or R² alongside p values. Briefly note measurement properties (reliability via Cronbach's alpha when reporting Likert constructs). 4–7 citations per major concept.";
    case "phd":
      return "Dense, theory-saturated. Effect sizes **and 95% confidence intervals** are required for every inferential test. State assumption checks (normality, homogeneity of variance, independence) inline where relevant. Engage critically with prior empirical and theoretical work — do not just summarise it. 7–12 citations per major concept.";
    case "journal":
      return "Strict IMRaD where the chapter maps onto it. Abstract-style economy — every sentence must earn its place. Effect sizes, 95% CIs, and assumption tests are required. Tight literature integration: cite the 1–3 most relevant studies per claim. Foreground the contribution, novelty, and limits of the work.";
  }
}

function instrumentLabel(instrument: ResearchInstrument): string {
  switch (instrument) {
    case "questionnaire":
      return "Questionnaire";
    case "interview":
      return "Interview";
    case "observation":
      return "Observation";
    case "secondary-data":
      return "Secondary Data";
  }
}

/** Escape pipes + collapse newlines so cell content is markdown-table-safe. */
function cell(s: string): string {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** Format a number for a cell with fixed decimals. Null / non-finite → em-dash. */
function fmt(x: number | null | undefined, digits: number): string {
  if (x === null || x === undefined) return "—";
  const v = Number(x);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

/** Format a min/max range cell — integers render without decimals. */
function fmtRange(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  const v = Number(x);
  if (!Number.isFinite(v)) return "—";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
