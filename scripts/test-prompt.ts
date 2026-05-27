/**
 * Verify /lib/buildPrompt.ts against the BUILD_GUIDE Phase 3 contract.
 *
 * Run:  npx tsx scripts/test-prompt.ts
 *
 * Checks:
 *   - system prompt embeds NEVER-invent rule + APA 7 + chapter discipline
 *   - system prompt ≤ 2000 tokens
 *   - user prompt for Ch4 / UG / 3 objectives / 50 rows: < 4000 tokens total
 *   - stats block contains mean, SD, decision for every Likert candidate
 *   - hypothesis section preserves Ho wording verbatim
 *   - user prompt ends with the canonical instruction
 *   - all five named blocks are present
 *   - level rules block reflects level-specific flags
 */

import {
  buildPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from "../lib/buildPrompt";
import type {
  IntakeFormData,
  ParsedDataset,
  ResearchLevel,
  StatResult,
} from "../types";

let pass = 0;
let fail = 0;

function ok(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  pass ${label}`);
    pass++;
  } else {
    console.error(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

/** Anthropic's tokenizer is BPE — chars/4 is a slight over-estimate for English. */
function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const intake: IntakeFormData = {
  title:
    "An assessment of e-learning adoption among undergraduate students",
  level: "undergraduate",
  institution: "Madonna University",
  objectives: [
    "To examine the level of e-learning adoption",
    "To identify barriers to e-learning adoption",
    "To assess the impact of e-learning on academic performance",
  ],
  hypotheses: [
    "There is no significant relationship between e-learning adoption and academic performance",
    "There is no significant difference in adoption rates between male and female students",
  ],
  instrument: "questionnaire",
  sampleSize: 50,
  description:
    "The study surveyed 50 undergraduate students at a private university about their adoption of e-learning platforms during the 2024 academic session.",
  likertPoints: 5,
  chapterTarget: "4",
};

const dataset: ParsedDataset = {
  headers: [
    "id",
    "gender",
    "age",
    "item1",
    "item2",
    "item3",
    "item4",
    "item5",
  ],
  rows: Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    gender: i % 2 === 0 ? "M" : "F",
    age: 18 + (i % 10),
    item1: 1 + (i % 5),
    item2: 1 + ((i + 1) % 5),
    item3: 1 + ((i + 2) % 5),
    item4: 1 + ((i + 3) % 5),
    item5: 1 + ((i + 4) % 5),
  })),
  numerics: ["id", "age", "item1", "item2", "item3", "item4", "item5"],
  categoricals: ["gender"],
  n: 50,
};

const stats: StatResult[] = [
  { variable: "id", mean: 25.5, sd: 14.43, min: 1, max: 50, skewness: 0 },
  { variable: "age", mean: 22.5, sd: 2.87, min: 18, max: 27, skewness: 0 },
  {
    variable: "item1",
    mean: 3.94,
    sd: 0.87,
    min: 1,
    max: 5,
    skewness: -0.42,
    decision: "Agreed",
  },
  {
    variable: "item2",
    mean: 3.56,
    sd: 0.93,
    min: 1,
    max: 5,
    skewness: -0.21,
    decision: "Agreed",
  },
  {
    variable: "item3",
    mean: 3.12,
    sd: 1.04,
    min: 1,
    max: 5,
    skewness: 0.08,
    decision: "Disagreed",
  },
  {
    variable: "item4",
    mean: 4.02,
    sd: 0.74,
    min: 1,
    max: 5,
    skewness: -0.61,
    decision: "Agreed",
  },
  {
    variable: "item5",
    mean: 3.81,
    sd: 0.88,
    min: 1,
    max: 5,
    skewness: -0.34,
    decision: "Agreed",
  },
];

// ---------------------------------------------------------------------------
// 1. System prompt
// ---------------------------------------------------------------------------
console.log("\n[buildSystemPrompt]");
const sys = buildSystemPrompt(intake.level);

ok(/NEVER invent statistics/.test(sys), "embeds NEVER-invent rule (verbatim phrase)");
ok(/APA 7/.test(sys), "embeds APA 7");
ok(/Markdown output/.test(sys) || /Pipe tables/.test(sys), "embeds markdown output rule");
ok(/Chapter 4 Likert tables/.test(sys), "embeds Likert table column contract");
ok(/Begin with `# Chapter/.test(sys), "embeds 'Begin with # Chapter' opening rule");
ok(/Audience.*Undergraduate/i.test(sys), "names the audience level");
ok(/\[Insert: /.test(sys), "includes [Insert: …] fallback instruction");

const sysTokens = approxTokens(sys);
console.log(`  info system prompt: ${sys.length} chars ≈ ${sysTokens} tokens`);
ok(sysTokens <= 2000, "system prompt ≤ 2000 tokens", `got ${sysTokens}`);

// Smoke test each level renders distinct guidance
const levels: ResearchLevel[] = ["undergraduate", "masters", "phd", "journal"];
const renders = new Set(levels.map(buildSystemPrompt));
ok(renders.size === levels.length, "each level produces a distinct system prompt");

// ---------------------------------------------------------------------------
// 2. User prompt — Ch4, undergraduate, 50 rows
// ---------------------------------------------------------------------------
console.log("\n[buildUserPrompt — Ch4 UG]");
const usr = buildUserPrompt(intake, dataset, stats, "4");

ok(usr.includes("# RESEARCH CONTEXT"), "contains RESEARCH CONTEXT block");
ok(usr.includes("# DATASET SUMMARY"), "contains DATASET SUMMARY block");
ok(usr.includes("# COMPUTED STATISTICS"), "contains COMPUTED STATISTICS block");
ok(usr.includes("# CHAPTER INSTRUCTION"), "contains CHAPTER INSTRUCTION block");
ok(usr.includes("# LEVEL RULES"), "contains LEVEL RULES block");
ok(
  usr.trimEnd().endsWith(
    "Begin writing now. Do not summarise. Do not ask questions.",
  ),
  "ends with the canonical instruction line",
);

// Hypothesis verbatim
for (const h of intake.hypotheses) {
  ok(usr.includes(h), `hypothesis preserved verbatim: "${h.slice(0, 40)}…"`);
}
ok(/Ho1: /.test(usr), "prepends Ho1: when hypothesis lacks an Ho prefix");

// Objectives preserved
for (const obj of intake.objectives) {
  ok(usr.includes(obj), `objective preserved: "${obj.slice(0, 40)}…"`);
}

// Stats table contains mean, SD, decision for every Likert candidate
const likertCandidates = stats.filter((s) => s.decision !== undefined);
for (const s of likertCandidates) {
  ok(
    usr.includes(s.variable) &&
      usr.includes(s.mean.toFixed(2)) &&
      usr.includes(s.sd.toFixed(2)) &&
      usr.includes(s.decision!),
    `Likert candidate ${s.variable} has mean/SD/decision in stats block`,
  );
}

// Sample size + scale shown
ok(/Sample Size \(N\):\*\* 50/.test(usr), "renders N = 50");
ok(/5-point \(decision threshold: mean ≥ 3\.50/.test(usr), "renders threshold 3.50 for 5-point");
ok(/Madonna University/.test(usr), "renders institution");

// Dataset summary table has every variable
for (const h of dataset.headers) {
  ok(usr.includes(`| ${h} |`), `dataset table lists "${h}"`);
}

// Chapter instruction picks up Ch4 + hypothesis prompt
ok(
  /Write \*\*Chapter 4 — Data Presentation and Analysis\*\*/.test(usr),
  "chapter instruction names Ch 4",
);
ok(
  /S\/N \| Item \| SD \| D \| N \| A \| SA \| Mean \| SD \| Decision/.test(
    usr,
  ),
  "chapter instruction restates the Likert table columns",
);
ok(
  /For each of the 2 hypotheses/.test(usr),
  "chapter instruction acknowledges the 2 hypotheses",
);

// Level rules block
ok(
  /Effect sizes required: No/.test(usr),
  "level rules: undergraduate → effect sizes No",
);
ok(/IMRaD structure: No/.test(usr), "level rules: undergraduate → IMRaD No");
ok(/Citation style: APA 7/.test(usr), "level rules: APA 7");

// Token budget
const userTokens = approxTokens(usr);
const totalTokens = sysTokens + userTokens;
console.log(`  info user prompt: ${usr.length} chars ≈ ${userTokens} tokens`);
console.log(`  info total: ≈ ${totalTokens} tokens`);
ok(totalTokens < 4000, "Ch4 / UG / 50 rows total < 4000 tokens", `got ${totalTokens}`);

// ---------------------------------------------------------------------------
// 3. Level differentiation in LEVEL RULES
// ---------------------------------------------------------------------------
console.log("\n[level differentiation]");
const phdIntake = { ...intake, level: "phd" as const };
const phdUser = buildUserPrompt(phdIntake, dataset, stats, "4");
ok(
  /Effect sizes required: Yes/.test(phdUser),
  "PhD level rules: effect sizes Yes",
);
ok(/IMRaD structure: Yes/.test(phdUser), "PhD level rules: IMRaD Yes");

// ---------------------------------------------------------------------------
// 4. Ch 1 — no data case (lit review)
// ---------------------------------------------------------------------------
console.log("\n[Ch1 — no data file]");
const emptyDataset: ParsedDataset = {
  headers: [],
  rows: [],
  numerics: [],
  categoricals: [],
  n: 0,
};
const ch1 = buildUserPrompt({ ...intake, chapterTarget: "1" }, emptyDataset, [], "1");
ok(/No data file uploaded/.test(ch1), "DATASET SUMMARY notes no file");
ok(
  /No descriptive statistics have been computed/.test(ch1),
  "COMPUTED STATISTICS notes no stats",
);
ok(
  /Write \*\*Chapter 1 — Introduction\*\*/.test(ch1),
  "chapter instruction names Ch 1",
);
ok(
  ch1.trimEnd().endsWith(
    "Begin writing now. Do not summarise. Do not ask questions.",
  ),
  "Ch1 still ends with canonical instruction",
);

// ---------------------------------------------------------------------------
// 5. "all" chapters convenience
// ---------------------------------------------------------------------------
console.log("\n[all chapters]");
const allUser = buildUserPrompt(intake, dataset, stats, "all");
for (const t of ["1", "2", "3", "4", "5"]) {
  ok(
    allUser.includes(`## Chapter ${t} — `),
    `all-chapters instruction lists Chapter ${t}`,
  );
}

// ---------------------------------------------------------------------------
// 6. buildPrompt convenience
// ---------------------------------------------------------------------------
console.log("\n[buildPrompt convenience]");
const both = buildPrompt(intake, dataset, stats, "4");
ok(both.system === sys, "buildPrompt.system matches buildSystemPrompt");
ok(both.user === usr, "buildPrompt.user matches buildUserPrompt");

// ---------------------------------------------------------------------------
// 7. Nigerian academic style — system prompt + Ch4 user prompt
// ---------------------------------------------------------------------------
console.log("\n[Nigerian academic style]");
ok(/Nigerian Academic Style/i.test(sys), "system has 'Nigerian Academic Style' heading");
ok(/the researcher/i.test(sys), "system tells the model to refer to 'the researcher'");
ok(/British spelling/i.test(sys), "system pins British spelling");
ok(
  /Decision Rule[\s\S]*p-value[\s\S]*0\.05/.test(sys),
  "system embeds the Decision Rule preamble",
);
ok(
  /null hypothesis is \*\*REJECTED\*\*/i.test(sys),
  "system embeds canonical Nigerian decision phrasing",
);
ok(/Source: Field Survey/i.test(sys), "system embeds 'Source: Field Survey' attribution");
ok(/Table 4\.1/.test(sys), "system shows the Table 4.X caption pattern");
ok(/Future researchers should/i.test(sys), "system primes 'Future researchers should…' for Ch 5");
ok(
  /(Adeyemo|Eze|Akinwale|Obi|Okolie|Adesina|Ajayi)/.test(sys),
  "system suggests Nigerian/African scholars",
);

console.log("\n[Ch3 — Yamane + validity]");
const ch3 = buildUserPrompt(intake, dataset, stats, "3");
ok(/Yamane/.test(ch3), "Ch 3 instruction names Yamane's formula");
ok(/face.*content.*construct|content.*face.*construct/i.test(ch3), "Ch 3 names all three validity types");
ok(/α ≥ 0\.70|alpha.*0\.7/.test(ch3), "Ch 3 names the α ≥ 0.70 reliability threshold");

console.log("\n[Ch4 — Nigerian table + decision conventions]");
ok(/Research Question 1/.test(usr), "Ch 4 opens each objective with 'Research Question N:'");
ok(/Source: Field Survey/.test(usr), "Ch 4 emits 'Source: Field Survey' line");
ok(/Table 4\.X/.test(usr), "Ch 4 references 'Table 4.X' caption pattern");
ok(/From Table 4\.X above/.test(usr), "Ch 4 includes the 'From Table 4.X above…' narrator pattern");
ok(/Decision Rule[\s\S]*p-value[\s\S]*< 0\.05/.test(usr), "Ch 4 emits the Decision Rule preamble");
ok(/REJECTED|NOT REJECTED/.test(usr), "Ch 4 spells the canonical Nigerian decision verbs");

console.log("\n[Ch5 — stakeholder recommendations]");
const ch5 = buildUserPrompt(intake, dataset, stats, "5");
ok(/The university management should/.test(ch5), "Ch 5 names 'The university management should…'");
ok(/Future researchers should/.test(ch5), "Ch 5 names 'Future researchers should…'");
ok(/In view of the findings|From the foregoing/.test(ch5), "Ch 5 uses Nigerian conclusion opener");

console.log("\n[token budget still within Phase 3 contract]");
const sysTokens2 = approxTokens(buildSystemPrompt("undergraduate"));
const userTokens2 = approxTokens(usr);
console.log(`  info system ${sysTokens2}, user ${userTokens2}, total ${sysTokens2 + userTokens2}`);
ok(sysTokens2 <= 2000, "system still ≤ 2000 tokens");
ok(sysTokens2 + userTokens2 < 4000, "Ch4/UG/50-row total still < 4000 tokens");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
