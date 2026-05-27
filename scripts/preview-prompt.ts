/** Quick visual preview of the generated prompt. Not a test. */
import { buildPrompt } from "../lib/buildPrompt";
import type {
  IntakeFormData,
  ParsedDataset,
  StatResult,
} from "../types";

const intake: IntakeFormData = {
  title: "An assessment of e-learning adoption among undergraduate students",
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
    "The study surveyed 50 undergraduate students at a private university about their adoption of e-learning platforms.",
  likertPoints: 5,
  chapterTarget: "4",
};

const dataset: ParsedDataset = {
  headers: ["id", "gender", "age", "item1", "item2", "item3"],
  rows: [],
  numerics: ["id", "age", "item1", "item2", "item3"],
  categoricals: ["gender"],
  n: 50,
};

const stats: StatResult[] = [
  { variable: "age", mean: 22.5, sd: 2.87, min: 18, max: 27, skewness: 0 },
  { variable: "item1", mean: 3.94, sd: 0.87, min: 1, max: 5, skewness: -0.42, decision: "Agreed" },
  { variable: "item2", mean: 3.56, sd: 0.93, min: 1, max: 5, skewness: -0.21, decision: "Agreed" },
  { variable: "item3", mean: 3.12, sd: 1.04, min: 1, max: 5, skewness: 0.08, decision: "Disagreed" },
];

const { system, user } = buildPrompt(intake, dataset, stats, "4");

console.log("================== SYSTEM PROMPT ==================\n");
console.log(system);
console.log("\n\n================== USER PROMPT ==================\n");
console.log(user);
