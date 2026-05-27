/**
 * Verify /lib/runAnalyses.ts wires data into the right tests.
 * Run: npx tsx scripts/test-analyses.ts
 */

import { inferTestKind, runAnalyses } from "../lib/runAnalyses";
import type {
  AnalysisMappings,
  IntakeFormData,
  ParsedDataset,
} from "../types";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  pass ${label}`);
    pass++;
  } else {
    console.error(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

const intake: IntakeFormData = {
  title: "Sample",
  level: "undergraduate",
  institution: "",
  objectives: [
    "To examine e-learning adoption",
    "To identify barriers",
  ],
  hypotheses: [
    "There is no relationship between adoption and performance",
    "There is no difference between males and females in adoption",
    "There is no association between gender and faculty",
  ],
  instrument: "questionnaire",
  sampleSize: 50,
  description: "",
  likertPoints: 5,
  chapterTarget: "4",
};

// Build a 50-row synthetic dataset.
const headers = [
  "id",
  "gender",
  "faculty",
  "performance",
  "adopt1",
  "adopt2",
  "adopt3",
  "barrier1",
  "barrier2",
];
const rows: ParsedDataset["rows"] = [];
for (let i = 0; i < 50; i++) {
  rows.push({
    id: i + 1,
    gender: i % 2 === 0 ? "Male" : "Female",
    faculty: ["Arts", "Science", "Engineering"][i % 3],
    // adoption-correlated performance: more adoption → higher score, plus noise
    performance: 60 + (i % 5) * 5 + (i % 2 === 0 ? 3 : -3),
    adopt1: 1 + (i % 5),
    adopt2: 1 + ((i + 1) % 5),
    adopt3: 1 + ((i + 2) % 5),
    barrier1: 1 + ((i + 3) % 5),
    barrier2: 1 + ((i + 4) % 5),
  });
}
const dataset: ParsedDataset = {
  headers,
  rows,
  numerics: ["id", "performance", "adopt1", "adopt2", "adopt3", "barrier1", "barrier2"],
  categoricals: ["gender", "faculty"],
  n: 50,
};

const mappings: AnalysisMappings = {
  objectives: {
    0: ["adopt1", "adopt2", "adopt3"],
    1: ["barrier1", "barrier2"],
  },
  hypotheses: {
    0: { hypothesisIndex: 0, kind: "pearson", varA: "adopt1", varB: "performance" },
    1: { hypothesisIndex: 1, kind: "ttest", varA: "gender", varB: "adopt1" },
    2: { hypothesisIndex: 2, kind: "chisquare", varA: "gender", varB: "faculty" },
  },
};

// ---------------------------------------------------------------------------
// inferTestKind
// ---------------------------------------------------------------------------
console.log("\n[inferTestKind]");
ok(inferTestKind(dataset, "adopt1", "performance") === "pearson", "two numerics → pearson");
ok(inferTestKind(dataset, "gender", "performance") === "ttest", "binary cat + numeric → ttest");
ok(inferTestKind(dataset, "faculty", "performance") === "anova", "3-level cat + numeric → anova");
ok(inferTestKind(dataset, "gender", "faculty") === "chisquare", "two cats → chisquare");
ok(inferTestKind(dataset, undefined, "performance") === "none", "missing var → none");

// ---------------------------------------------------------------------------
// runAnalyses
// ---------------------------------------------------------------------------
console.log("\n[runAnalyses]");
const bundle = runAnalyses(intake, dataset, mappings);

ok(bundle.reliability.length === 2, "two reliability entries");
const obj0 = bundle.reliability[0];
ok(obj0.itemCount === 3, "objective 0 has 3 items");
ok(obj0.n === 50, "objective 0 listwise N = 50");
ok(typeof obj0.alpha === "number", "objective 0 α computed");
console.log(`  info objective 0 α = ${obj0.alpha?.toFixed(3)} (${obj0.interpretation})`);

ok(bundle.hypotheses.length === 3, "three hypothesis analyses");
const h0 = bundle.hypotheses[0];
ok(h0.spec.kind === "pearson", "H0 → pearson");
ok(h0.result?.kind === "pearson", "H0 result present");
if (h0.result?.kind === "pearson") {
  console.log(`  info Pearson r = ${h0.result.data.r.toFixed(3)}, p = ${h0.result.data.p.toFixed(3)}`);
  ok(Number.isFinite(h0.result.data.r), "pearson r is finite");
}

const h1 = bundle.hypotheses[1];
ok(h1.spec.kind === "ttest", "H1 → ttest");
ok(h1.result?.kind === "ttest", "H1 result present");
if (h1.result?.kind === "ttest") {
  console.log(`  info t = ${h1.result.data.t.toFixed(3)}, p = ${h1.result.data.p.toFixed(3)}, d = ${h1.result.data.cohenD.toFixed(3)}`);
  ok(["Male", "Female"].includes(h1.result.groupLabelA), "ttest labels populated");
}

const h2 = bundle.hypotheses[2];
ok(h2.spec.kind === "chisquare", "H2 → chisquare");
ok(h2.result?.kind === "chisquare", "H2 result present");
if (h2.result?.kind === "chisquare") {
  console.log(`  info χ² = ${h2.result.data.chi2.toFixed(3)}, df = ${h2.result.data.df}, V = ${h2.result.data.cramersV.toFixed(3)}`);
  ok(h2.result.rowLevels.length === 2, "chi-sq 2 row levels");
  ok(h2.result.colLevels.length === 3, "chi-sq 3 col levels");
}

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------
console.log("\n[errors]");
const badMap: AnalysisMappings = {
  objectives: { 0: ["adopt1"] }, // only 1 item — α can't compute
  hypotheses: {
    0: { hypothesisIndex: 0, kind: "pearson", varA: "gender", varB: "performance" },
  },
};
const bad = runAnalyses(intake, dataset, badMap);
ok(bad.reliability[0].alpha === null, "single-item α is null");
ok(!!bad.reliability[0].error, "single-item α reports error");
ok(!!bad.hypotheses[0].error, "pearson on non-numeric reports error");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
