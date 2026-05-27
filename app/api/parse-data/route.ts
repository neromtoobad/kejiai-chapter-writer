import { NextResponse, type NextRequest } from "next/server";
import {
  ParseFailureError,
  UnsupportedFileTypeError,
  parseFile,
} from "@/lib/parseData";
import { decideFromMean, descriptive } from "@/lib/computeStats";
import { FILE_LIMITS, LIKERT_THRESHOLDS } from "@/lib/constants";
import type {
  IntakeFormData,
  LikertScalePoints,
  ParsedDataset,
  StatResult,
} from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/parse-data
 *
 * Multipart form fields:
 *   file:   the user's CSV / XLSX / XLS upload (required, ≤ 5 MB)
 *   intake: optional JSON string of `IntakeFormData` (used for Likert scale resolution)
 *
 * Response on success:
 *   {
 *     dataset:  ParsedDataset,
 *     stats:    StatResult[],          // one per numeric column
 *     rawTable: (string | number | null)[][]  // headers row + data rows
 *   }
 *
 * Error mapping:
 *   400 — missing file, bad multipart, bad intake JSON, unsupported extension
 *   413 — file exceeds FILE_LIMITS.maxBytes
 *   422 — parser ran but produced no usable data, or threw a parse error
 *   500 — anything else (with a generic message)
 */
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Empty file uploaded" },
      { status: 422 },
    );
  }
  if (file.size > FILE_LIMITS.maxBytes) {
    return NextResponse.json(
      { error: "File too large. Max 5MB." },
      { status: 413 },
    );
  }

  const intake = parseIntake(formData.get("intake"));
  if (intake.error) {
    return NextResponse.json({ error: intake.error }, { status: 400 });
  }

  const filename = file.name || "upload";
  const buffer = Buffer.from(await file.arrayBuffer());

  let dataset: ParsedDataset;
  try {
    dataset = parseFile(filename, buffer);
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ParseFailureError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : "Failed to parse file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (dataset.n === 0) {
    return NextResponse.json(
      { error: "No data found in file" },
      { status: 422 },
    );
  }

  const likertPoints = intake.value.likertPoints ?? 5;
  const threshold =
    LIKERT_THRESHOLDS[likertPoints] ?? LIKERT_THRESHOLDS[5];

  const stats: StatResult[] = [];
  for (const name of dataset.numerics) {
    const col = dataset.rows
      .map((r) => r[name])
      .filter(
        (v): v is number =>
          typeof v === "number" && Number.isFinite(v),
      );
    if (col.length === 0) continue;
    const d = descriptive(col);
    const isLikert = col.every(
      (v) => Number.isInteger(v) && v >= 1 && v <= likertPoints,
    );
    const result: StatResult = {
      variable: name,
      mean: round(d.mean, 4),
      sd: round(d.sd, 4),
      min: d.min,
      max: d.max,
      skewness: d.skewness === null ? null : round(d.skewness, 4),
    };
    if (isLikert) {
      result.decision = decideFromMean(d.mean, threshold);
    }
    stats.push(result);
  }

  const rawTable: (string | number | null)[][] = [
    dataset.headers,
    ...dataset.rows.map((r) => dataset.headers.map((h) => r[h] ?? null)),
  ];

  return NextResponse.json({ dataset, stats, rawTable });
}

interface IntakeParseResult {
  value: Partial<IntakeFormData>;
  error?: string;
}

function parseIntake(raw: FormDataEntryValue | null): IntakeParseResult {
  if (raw === null) return { value: {} };
  if (typeof raw !== "string") {
    return { value: {}, error: "Invalid intake field" };
  }
  if (raw.trim() === "") return { value: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const partial = parsed as Partial<IntakeFormData>;
      if (
        partial.likertPoints !== undefined &&
        !isLikertPoints(partial.likertPoints)
      ) {
        return { value: {}, error: "Invalid likertPoints — must be 4, 5, or 7" };
      }
      return { value: partial };
    }
    return { value: {}, error: "Intake JSON must be an object" };
  } catch {
    return { value: {}, error: "Invalid intake JSON" };
  }
}

function isLikertPoints(v: unknown): v is LikertScalePoints {
  return v === 4 || v === 5 || v === 7;
}

function round(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const m = Math.pow(10, digits);
  return Math.round(x * m) / m;
}
