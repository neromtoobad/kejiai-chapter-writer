/**
 * KejiAI — markdown → .docx exporter.
 *
 * Converts the chapter markdown produced by Claude into a Word document that
 * matches Nigerian university project conventions: Times New Roman, 12pt
 * body, double-line spacing, justified, 1-inch margins. Headings use the
 * standard hierarchy (H1 centered bold, H2 left-aligned bold, etc.). Tables
 * are rendered with borders. Chart fences are replaced by PNG images that
 * the client rasterizes from the rendered Recharts SVGs.
 *
 * The parser is hand-rolled (no remark/unified) to keep the bundle small
 * and the output deterministic for this specific markdown dialect.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
} from "docx";

export interface ExportDocxInput {
  /** Raw chapter markdown — the full stream output. */
  markdown: string;
  /** Title used for the document header / fallback filename. */
  chapterTitle?: string;
  /** Map of chart id → base64-encoded PNG (no data URL prefix). */
  chartImages?: Record<string, string>;
}

// Word "twips" = 1/20 of a point. 1 inch = 1440 twips.
const ONE_INCH = 1440;
const PAGE_USABLE_WIDTH_TWIPS = 9000; // ~6.25 in usable
const CHART_IMG_WIDTH_PX = 500;
const CHART_IMG_HEIGHT_PX = 280;

// Body text style: Times New Roman, 12pt (= 24 half-points), double-line.
const BODY_FONT = "Times New Roman";
const BODY_SIZE = 24;
const DOUBLE_LINE = 480; // 240 = single, 480 = double

export async function exportToDocx(
  input: ExportDocxInput,
): Promise<Uint8Array> {
  const children = parseChildren(
    input.markdown,
    input.chartImages ?? {},
  );

  const doc = new Document({
    creator: "KejiAI",
    title: input.chapterTitle ?? "KejiAI chapter",
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "kejiai-numbered",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: ONE_INCH,
              right: ONE_INCH,
              bottom: ONE_INCH,
              left: ONE_INCH,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as Promise<Uint8Array>;
}

// ===========================================================================
// Parser
// ===========================================================================

type DocChild = Paragraph | Table;

function parseChildren(
  markdown: string,
  chartImages: Record<string, string>,
): DocChild[] {
  const out: DocChild[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      out.push(heading(line.slice(2).trim(), 1));
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(heading(line.slice(3).trim(), 2));
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(heading(line.slice(4).trim(), 3));
      i++;
      continue;
    }
    if (line.startsWith("#### ")) {
      out.push(heading(line.slice(5).trim(), 4));
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---+|\*\*\*+)\s*$/.test(line)) {
      out.push(
        new Paragraph({
          border: {
            bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
        }),
      );
      i++;
      continue;
    }

    // Chart fence — render the PNG, drop the fence
    if (/^\s*```chart\s*$/.test(line)) {
      const start = i + 1;
      let end = start;
      while (end < lines.length && !lines[end].trimStart().startsWith("```")) {
        end++;
      }
      const json = lines.slice(start, end).join("\n");
      const para = chartParagraph(json, chartImages);
      if (para) out.push(para);
      i = end + 1;
      continue;
    }

    // Generic code fence — skip but keep the inner text in a monospace para
    if (line.trimStart().startsWith("```")) {
      const start = i + 1;
      let end = start;
      while (end < lines.length && !lines[end].trimStart().startsWith("```")) {
        end++;
      }
      const body = lines.slice(start, end).join("\n");
      if (body.trim()) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: body, font: "Consolas", size: 20 }),
            ],
          }),
        );
      }
      i = end + 1;
      continue;
    }

    // Pipe table
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      out.push(buildTable(tableLines));
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        out.push(
          new Paragraph({
            children: parseInline(lines[i].replace(/^\s*[-*]\s+/, "")),
            bullet: { level: 0 },
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: DOUBLE_LINE, after: 120 },
          }),
        );
        i++;
      }
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        out.push(
          new Paragraph({
            children: parseInline(lines[i].replace(/^\s*\d+\.\s+/, "")),
            numbering: { reference: "kejiai-numbered", level: 0 },
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: DOUBLE_LINE, after: 120 },
          }),
        );
        i++;
      }
      continue;
    }

    // Normal paragraph — accumulate until a blank line or a structural line.
    const paraLines: string[] = [line];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (
        next.trim() === "" ||
        /^#{1,6}\s/.test(next) ||
        next.trimStart().startsWith("|") ||
        next.trimStart().startsWith("```") ||
        /^\s*[-*]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        /^(---+|\*\*\*+)\s*$/.test(next)
      ) {
        break;
      }
      paraLines.push(next);
      i++;
    }
    const text = paraLines.join(" ");
    out.push(
      new Paragraph({
        children: parseInline(text),
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: DOUBLE_LINE, after: 120 },
      }),
    );
    i++;
  }

  return out;
}

// ===========================================================================
// Block builders
// ===========================================================================

function heading(text: string, level: 1 | 2 | 3 | 4): Paragraph {
  const size = level === 1 ? 32 : level === 2 ? 28 : level === 3 ? 24 : 22;
  return new Paragraph({
    children: parseInline(text, { bold: true, size, font: BODY_FONT }),
    heading:
      level === 1
        ? HeadingLevel.HEADING_1
        : level === 2
          ? HeadingLevel.HEADING_2
          : level === 3
            ? HeadingLevel.HEADING_3
            : HeadingLevel.HEADING_4,
    alignment: level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 240, after: 120, line: DOUBLE_LINE },
    pageBreakBefore: level === 1,
  });
}

function chartParagraph(
  json: string,
  chartImages: Record<string, string>,
): Paragraph | null {
  let spec: { id?: string } | null = null;
  try {
    spec = JSON.parse(json) as { id?: string };
  } catch {
    return null;
  }
  if (!spec?.id) return null;
  const png = chartImages[spec.id];
  if (!png) return null;

  let imageBytes: Uint8Array;
  try {
    imageBytes = base64ToBytes(png);
  } catch {
    return null;
  }

  return new Paragraph({
    children: [
      new ImageRun({
        // The `docx` types are awkward around image data; the runtime accepts
        // a Uint8Array, which is what we have.
        data: imageBytes as unknown as ArrayBuffer,
        transformation: {
          width: CHART_IMG_WIDTH_PX,
          height: CHART_IMG_HEIGHT_PX,
        },
        type: "png",
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
  });
}

function buildTable(rawLines: string[]): Table {
  // Drop separator rows like |---|---|.
  const dataLines = rawLines.filter(
    (l) => !/^\|[\s:|\-]+\|?\s*$/.test(l.trim()),
  );

  const rows: TableRow[] = dataLines.map((line, rowIdx) => {
    const cells = splitTableRow(line);
    const isHeader = rowIdx === 0;
    return new TableRow({
      children: cells.map(
        (text) =>
          new TableCell({
            children: [
              new Paragraph({
                children: parseInline(
                  text,
                  isHeader ? { bold: true } : {},
                ),
                spacing: { line: 280 },
              }),
            ],
            width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
          }),
      ),
    });
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "cccccc" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "cccccc" },
    },
  });
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  // Split on unescaped pipes.
  const cells: string[] = [];
  let buf = "";
  for (let k = 0; k < trimmed.length; k++) {
    const ch = trimmed[k];
    if (ch === "\\" && trimmed[k + 1] === "|") {
      buf += "|";
      k++;
      continue;
    }
    if (ch === "|") {
      cells.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

// ===========================================================================
// Inline parsing — **bold**, *italic*, `code`, [text](url)
// ===========================================================================

/**
 * Parse markdown inline tokens into TextRuns. `overrides` are merged into
 * every emitted run so callers (headings, table headers) can layer style.
 *
 * Supported: **bold**, *italic*, `code`. Everything else passes through as
 * plain text. We avoid `cloneRun`-style hacks because the docx library does
 * not expose a way to read back a TextRun's options.
 */
function parseInline(
  text: string,
  overrides: Partial<IRunOptions> = {},
): TextRun[] {
  if (!text) return [new TextRun({ text: "", ...overrides })];
  const runs: TextRun[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      runs.push(new TextRun({ text: buf, ...overrides }));
      buf = "";
    }
  };

  while (i < text.length) {
    // Bold **...**
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        runs.push(
          new TextRun({
            text: text.slice(i + 2, end),
            ...overrides,
            bold: true,
          }),
        );
        i = end + 2;
        continue;
      }
    }
    // Italic *...*  (single * not followed by space, not part of **)
    if (
      text[i] === "*" &&
      text[i + 1] !== "*" &&
      text[i + 1] !== " "
    ) {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1 && text[end - 1] !== " ") {
        flush();
        runs.push(
          new TextRun({
            text: text.slice(i + 1, end),
            ...overrides,
            italics: true,
          }),
        );
        i = end + 1;
        continue;
      }
    }
    // Inline code `...`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        runs.push(
          new TextRun({
            text: text.slice(i + 1, end),
            ...overrides,
            font: "Consolas",
            size: 22,
          }),
        );
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return runs.length > 0 ? runs : [new TextRun({ text: "", ...overrides })];
}

// ===========================================================================
// Base64 → bytes
// ===========================================================================

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.includes(",") ? b64.split(",")[1] : b64;
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  // Browser fallback — not used on the Node runtime route, but safe.
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

