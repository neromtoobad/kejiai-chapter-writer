/**
 * KejiAI — file ingestion.
 *
 * `parseCSV` and `parseXLSX` are the typed entry points. `parseFile` is a
 * convenience dispatcher used by the API route. The output is always the
 * same `ParsedDataset` shape so downstream consumers don't care which
 * format the user uploaded.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ParsedDataset } from "@/types";

/** Cell types we accept after normalisation. */
type RawCell = string | number | boolean | null;

/** Thrown when a file extension is not recognised. The route maps this to 400. */
export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(
      `Unsupported file type: ${filename}. Accepted: .csv, .xlsx, .xls`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

/** Thrown on structural problems with the file (no rows, malformed, etc.). */
export class ParseFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseFailureError";
  }
}

/** Top-level dispatcher. The route uses this. */
export function parseFile(filename: string, buffer: Buffer): ParsedDataset {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseCSV(buffer);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseXLSX(buffer);
  throw new UnsupportedFileTypeError(filename);
}

/** Parse a CSV buffer into a `ParsedDataset`. */
export function parseCSV(buffer: Buffer): ParsedDataset {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    header: false,
    dynamicTyping: false,
  });

  // FieldMismatch (ragged rows) is recoverable via padding; Delimiter and
  // Quotes errors mean the file itself is structurally broken.
  const hardErrors = result.errors.filter(
    (e) => e.type === "Delimiter" || e.type === "Quotes",
  );
  if (hardErrors.length > 0) {
    throw new ParseFailureError(
      `CSV parse error: ${hardErrors[0].message}`,
    );
  }

  const data = result.data as unknown[][];
  if (data.length === 0) {
    throw new ParseFailureError("Empty file");
  }

  const headers = (data[0] as unknown[]).map((h) =>
    String(h ?? "").trim(),
  );
  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new ParseFailureError("No headers detected");
  }

  const rawRows: RawCell[][] = data
    .slice(1)
    .map((row) => (row as unknown[]).map(normalizeCell));

  return classifyAndBuild(headers, rawRows);
}

/** Parse an XLSX/XLS buffer into a `ParsedDataset`. Uses the first sheet. */
export function parseXLSX(buffer: Buffer): ParsedDataset {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown XLSX read error";
    throw new ParseFailureError(`XLSX parse error: ${msg}`);
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new ParseFailureError("Workbook contains no sheets");
  }
  const sheet = wb.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
  if (data.length === 0) {
    throw new ParseFailureError("Empty sheet");
  }

  const headerRow = (data[0] as unknown[]) ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim());
  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new ParseFailureError("No headers detected");
  }

  const rawRows: RawCell[][] = data
    .slice(1)
    .map((row) => (row as unknown[]).map(normalizeCell));

  return classifyAndBuild(headers, rawRows);
}

/** Coerce any cell into `string | number | boolean | null`. */
function normalizeCell(cell: unknown): RawCell {
  if (cell === undefined || cell === null) return null;
  if (typeof cell === "string") {
    const s = cell.trim();
    return s === "" ? null : s;
  }
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell === "boolean") return cell;
  // Dates and other objects — string-coerce.
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

/**
 * Walk the columns, classify each as numeric or categorical, then emit the
 * final dataset with typed row objects.
 *
 * A column is "numeric" iff every non-null value parses to a finite number.
 */
function classifyAndBuild(
  headers: string[],
  rawRows: RawCell[][],
): ParsedDataset {
  // Pad/truncate rows to match the header length so column access is uniform.
  const padded: RawCell[][] = rawRows.map((row) => {
    const r: RawCell[] = new Array(headers.length).fill(null);
    for (let i = 0; i < Math.min(row.length, headers.length); i++) {
      r[i] = row[i] ?? null;
    }
    return r;
  });

  // Drop rows that are entirely null after padding.
  const cleaned = padded.filter((row) => row.some((c) => c !== null));

  const isNumericCol: boolean[] = headers.map((_, colIdx) => {
    const colVals = cleaned
      .map((row) => row[colIdx])
      .filter((v): v is Exclude<RawCell, null> => v !== null);
    if (colVals.length === 0) return false;
    return colVals.every((v) => {
      if (typeof v === "number") return Number.isFinite(v);
      const n = Number(String(v).trim());
      return Number.isFinite(n);
    });
  });

  const numerics: string[] = [];
  const categoricals: string[] = [];
  headers.forEach((h, i) => {
    if (isNumericCol[i]) numerics.push(h);
    else categoricals.push(h);
  });

  const rows = cleaned.map((row) => {
    const obj: Record<string, string | number | null> = {};
    headers.forEach((h, i) => {
      const cell = row[i];
      if (cell === null) {
        obj[h] = null;
      } else if (isNumericCol[i]) {
        const n =
          typeof cell === "number" ? cell : Number(String(cell).trim());
        obj[h] = Number.isFinite(n) ? n : null;
      } else {
        obj[h] =
          typeof cell === "string" ? cell : String(cell);
      }
    });
    return obj;
  });

  return {
    headers,
    rows,
    numerics,
    categoricals,
    n: rows.length,
  };
}
