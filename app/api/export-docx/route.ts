import { NextResponse, type NextRequest } from "next/server";
import { exportToDocx } from "@/lib/exportDocx";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ExportBody {
  markdown: string;
  chapterTitle?: string;
  filename?: string;
  /** Map of chart id → base64 PNG (with or without data: prefix). */
  chartImages?: Record<string, string>;
}

const MAX_MARKDOWN_CHARS = 200_000;
const MAX_CHART_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/export-docx
 *
 * Accepts a chapter's markdown plus a map of chart-id → base64-PNG and
 * returns the assembled .docx as a binary download.
 */
export async function POST(req: NextRequest) {
  let body: ExportBody;
  try {
    body = (await req.json()) as ExportBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.markdown || typeof body.markdown !== "string") {
    return NextResponse.json(
      { error: "Missing markdown" },
      { status: 400 },
    );
  }
  if (body.markdown.length > MAX_MARKDOWN_CHARS) {
    return NextResponse.json(
      { error: "Markdown exceeds maximum length" },
      { status: 413 },
    );
  }

  // Soft cap on total chart payload size.
  if (body.chartImages) {
    let total = 0;
    for (const v of Object.values(body.chartImages)) {
      if (typeof v !== "string") {
        return NextResponse.json(
          { error: "chartImages values must be strings" },
          { status: 400 },
        );
      }
      total += v.length;
      if (total > MAX_CHART_BYTES) {
        return NextResponse.json(
          { error: "chartImages exceed maximum size" },
          { status: 413 },
        );
      }
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = await exportToDocx({
      markdown: body.markdown,
      chapterTitle: body.chapterTitle,
      chartImages: body.chartImages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const filename =
    sanitizeFilename(body.filename ?? body.chapterTitle ?? "kejiai-chapter") +
    ".docx";

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "kejiai-chapter"
  );
}
