import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { buildCharts } from "@/lib/buildCharts";
import { buildPrompt } from "@/lib/buildPrompt";
import {
  CLAUDE_MODEL,
  RATE_LIMITS,
  STREAMING_TARGETS,
} from "@/lib/constants";
import { runAnalyses } from "@/lib/runAnalyses";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/ratelimit";
import type {
  AnalysisMappings,
  ChapterTarget,
  IntakeFormData,
  ParsedDataset,
  StatResult,
} from "@/types";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Maximum output tokens for a single chapter. Generous — a Ch 4 can run long. */
const MAX_OUTPUT_TOKENS = 16_000;

interface GenerateBody {
  intake: IntakeFormData;
  dataset: ParsedDataset;
  stats: StatResult[];
  chapterTarget: ChapterTarget;
  /** Optional — when present, drives Cronbach + hypothesis tests. */
  mappings?: AnalysisMappings;
}

const VALID_TARGETS: ReadonlySet<ChapterTarget> = new Set<ChapterTarget>([
  "1",
  "2",
  "3",
  "4",
  "5",
  "all",
]);

/**
 * POST /api/generate
 *
 * Body: { intake, dataset, stats, chapterTarget }
 *
 * Response: text/plain ReadableStream of Claude's output, token-by-token.
 * Errors before the stream begins are JSON 4xx/5xx. Errors mid-stream are
 * embedded into the text stream as `[Insert: generation error — …]` so the
 * client sees something concrete instead of a silent cut-off.
 */
export async function POST(req: NextRequest) {
  // Per-IP rate limit — protects the Anthropic budget on a public deploy.
  // We check before parsing the body so abusive callers don't even allocate.
  const ip = getClientIp(req);
  const rl = rateLimit(`gen:${ip}`, RATE_LIMITS.generate);
  if (!rl.ok) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((rl.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      {
        error: `Rate limit reached. You can generate ${rl.limit} chapter${rl.limit === 1 ? "" : "s"} per hour. Try again in ${formatRetryAfter(retryAfterSec)}.`,
      },
      {
        status: 429,
        headers: rateLimitHeaders(rl, retryAfterSec),
      },
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const issue = validateBody(body);
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return NextResponse.json(
      { error: "Configuration error. Contact support." },
      { status: 500 },
    );
  }

  // Run Cronbach's α + hypothesis tests when the client supplied mappings
  // and the dataset has rows. Both must be true; without rows there's no
  // way to compute. Failures are non-fatal — the prompt embeds error notes
  // so the chapter still uses `[Insert: …]` markers cleanly.
  const analyses =
    body.mappings &&
    body.dataset.rows.length > 0 &&
    (Object.keys(body.mappings.objectives).length > 0 ||
      Object.keys(body.mappings.hypotheses).length > 0)
      ? safeRunAnalyses(body.intake, body.dataset, body.mappings)
      : undefined;

  // Chart specs are deterministic from the data + mappings + analyses. The
  // model copies fences verbatim; the viewer renders them via Recharts.
  const charts = buildCharts(
    body.intake,
    body.dataset,
    body.stats,
    body.mappings,
    analyses,
    body.chapterTarget,
  );

  const { system, user } = buildPrompt(
    body.intake,
    body.dataset,
    body.stats,
    body.chapterTarget,
    analyses,
    charts.length > 0 ? charts : undefined,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const client = new Anthropic({ apiKey });
      const abortCtrl = new AbortController();

      const timeoutId = setTimeout(() => {
        abortCtrl.abort();
      }, STREAMING_TARGETS.hardTimeoutMs);

      const onClientAbort = () => abortCtrl.abort();
      req.signal.addEventListener("abort", onClientAbort);

      let closed = false;
      const enqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      try {
        const sdkStream = client.messages.stream(
          {
            model: CLAUDE_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages: [{ role: "user", content: user }],
          },
          { signal: abortCtrl.signal },
        );

        sdkStream.on("text", (delta: string) => enqueue(delta));

        await sdkStream.finalMessage();
      } catch (err) {
        if (abortCtrl.signal.aborted) {
          // Timeout or client disconnect. The client-disconnect case won't
          // see this text (their reader is gone) — the timeout case will.
          enqueue(
            `\n\n**Generation timed out.** Try a shorter chapter or smaller dataset.\n`,
          );
        } else {
          enqueue(
            `\n\n[Insert: generation error — ${stringifyError(err)}]\n`,
          );
        }
      } finally {
        clearTimeout(timeoutId);
        req.signal.removeEventListener("abort", onClientAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering so tokens arrive ASAP.
      "X-Accel-Buffering": "no",
      "X-RateLimit-Limit": String(rl.limit),
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
    },
  });
}

function rateLimitHeaders(
  rl: { limit: number; remaining: number; resetAt: number },
  retryAfterSec: number,
): Record<string, string> {
  return {
    "Retry-After": String(retryAfterSec),
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
}

function validateBody(body: Partial<GenerateBody> | null | undefined): string | null {
  if (!body || typeof body !== "object") return "Invalid body";
  if (!body.intake || typeof body.intake !== "object") return "Missing intake";
  if (!body.dataset || typeof body.dataset !== "object") return "Missing dataset";
  if (!Array.isArray(body.stats)) return "Missing stats array";
  if (!body.chapterTarget) return "Missing chapterTarget";
  if (!VALID_TARGETS.has(body.chapterTarget)) return "Invalid chapterTarget";
  return null;
}

function safeRunAnalyses(
  intake: IntakeFormData,
  dataset: ParsedDataset,
  mappings: AnalysisMappings,
) {
  try {
    return runAnalyses(intake, dataset, mappings);
  } catch (err) {
    // Don't kill the request over analysis trouble — the chapter will fall
    // back to `[Insert: …]` markers, exactly the contract the system prompt
    // already enforces.
    // eslint-disable-next-line no-console
    console.error("runAnalyses failed:", err);
    return undefined;
  }
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
