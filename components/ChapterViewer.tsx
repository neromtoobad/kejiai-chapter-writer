"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chart, parseChartSpec } from "@/components/Chart";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type {
  AnalysisMappings,
  ChapterTarget,
  IntakeFormData,
  ParsedDataset,
  StatResult,
} from "@/types";

/** Concrete (non-"all") chapter target. */
type SingleTarget = Exclude<ChapterTarget, "all">;

const ALL_TARGETS: SingleTarget[] = ["1", "2", "3", "4", "5"];

const CHAPTER_TITLES: Record<SingleTarget, string> = {
  "1": "Introduction",
  "2": "Literature Review",
  "3": "Methodology",
  "4": "Data Presentation and Analysis",
  "5": "Summary, Conclusion and Recommendations",
};

interface ChapterViewerProps {
  intake: IntakeFormData;
  dataset: ParsedDataset;
  stats: StatResult[];
  mappings?: AnalysisMappings;
  chapterTarget: ChapterTarget;
  /** Return to the intake view. */
  onReset: () => void;
}

type ChapterStatus = "idle" | "streaming" | "done" | "error";

interface ChapterState {
  content: string;
  status: ChapterStatus;
  error?: string;
}

export function ChapterViewer({
  intake,
  dataset,
  stats,
  mappings,
  chapterTarget,
  onReset,
}: ChapterViewerProps) {
  const isAll = chapterTarget === "all";
  const initialActive: SingleTarget = isAll ? "1" : chapterTarget;

  const [active, setActive] = useState<SingleTarget>(initialActive);
  const [chapters, setChapters] = useState<Record<SingleTarget, ChapterState>>(
    () => ({}) as Record<SingleTarget, ChapterState>,
  );

  /** One AbortController per target so we can cancel each chapter independently. */
  const abortsRef = useRef<Partial<Record<SingleTarget, AbortController>>>({});

  /**
   * Kick off a generation for `target`. Aborts any in-flight stream for that
   * same target first (used by Retry). Other targets continue streaming in
   * the background.
   */
  const generate = useCallback(
    async (target: SingleTarget) => {
      abortsRef.current[target]?.abort();
      const ctrl = new AbortController();
      abortsRef.current[target] = ctrl;

      setChapters((c) => ({
        ...c,
        [target]: { content: "", status: "streaming" },
      }));

      // Include rows when mappings are present so the server can run
      // Cronbach + hypothesis tests. Otherwise strip them to save bandwidth —
      // the prompt builder doesn't read rows on its own.
      const needsRows =
        !!mappings &&
        (Object.keys(mappings.objectives).length > 0 ||
          Object.keys(mappings.hypotheses).length > 0);
      const datasetPayload: ParsedDataset = {
        headers: dataset.headers,
        rows: needsRows ? dataset.rows : [],
        numerics: dataset.numerics,
        categoricals: dataset.categoricals,
        n: dataset.n,
      };

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intake,
            dataset: datasetPayload,
            stats,
            mappings,
            chapterTarget: target,
          }),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            errBody.error || `Generation failed (HTTP ${res.status})`,
          );
        }
        if (!res.body) {
          throw new Error("Response had no body");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setChapters((c) => ({
            ...c,
            [target]: { content: accumulated, status: "streaming" },
          }));
        }

        setChapters((c) => ({
          ...c,
          [target]: { content: accumulated, status: "done" },
        }));
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setChapters((c) => ({
          ...c,
          [target]: {
            content: c[target]?.content ?? "",
            status: "error",
            error: err instanceof Error ? err.message : "Generation failed",
          },
        }));
      }
    },
    [intake, dataset, stats, mappings],
  );

  // Auto-generate the active chapter when it becomes active and is idle.
  useEffect(() => {
    const state = chapters[active];
    if (!state || state.status === "idle") {
      void generate(active);
    }
    // chapters intentionally omitted — re-running on every chunk would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Abort every in-flight stream on unmount.
  useEffect(() => {
    return () => {
      const aborts = abortsRef.current;
      (Object.keys(aborts) as SingleTarget[]).forEach((k) => {
        aborts[k]?.abort();
      });
    };
  }, []);

  const activeState: ChapterState = chapters[active] ?? {
    content: "",
    status: "idle",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          New research
        </Button>
        <ChapterActions
          content={activeState.content}
          target={active}
          title={intake.title}
        />
      </div>

      {isAll && (
        <TabBar active={active} chapters={chapters} onSelect={setActive} />
      )}

      <Card className="border-border/40 bg-card/40 p-6 md:p-10">
        <ChapterBody
          state={activeState}
          target={active}
          onRetry={() => void generate(active)}
        />
      </Card>
    </div>
  );
}

// ===========================================================================
// Subcomponents
// ===========================================================================

function ChapterBody({
  state,
  target,
  onRetry,
}: {
  state: ChapterState;
  target: SingleTarget;
  onRetry: () => void;
}) {
  const isStreaming = state.status === "streaming";
  const isEmpty = state.content.length === 0;

  if (state.status === "error" && isEmpty) {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="font-serif text-lg text-destructive">
          Generation failed.
        </p>
        <p className="text-sm text-muted-foreground">{state.error}</p>
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-2">
          <RefreshCw className="h-3 w-3" />
          Try again
        </Button>
      </div>
    );
  }

  if (isEmpty && isStreaming) {
    return <ProgressShimmer chapterTitle={CHAPTER_TITLES[target]} />;
  }

  return (
    <article className="space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {state.content}
      </ReactMarkdown>
      {isStreaming && (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
          Streaming…
        </div>
      )}
      {state.status === "error" && (
        <div className="mt-6 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="mb-1 font-medium text-destructive">
            Generation interrupted
          </p>
          <p className="mb-2 text-xs text-muted-foreground">{state.error}</p>
          <Button onClick={onRetry} variant="outline" size="sm">
            <RefreshCw className="h-3 w-3" />
            Resume
          </Button>
        </div>
      )}
    </article>
  );
}

function ProgressShimmer({ chapterTitle }: { chapterTitle: string }) {
  const phrases = useMemo(
    () => [
      "Analysing data…",
      `Writing ${chapterTitle.toLowerCase()}…`,
      "Building tables…",
      "Citing the literature…",
    ],
    [chapterTitle],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % phrases.length),
      1800,
    );
    return () => clearInterval(id);
  }, [phrases.length]);
  return (
    <div className="space-y-3 py-16 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
      <p className="font-mono text-sm text-muted-foreground">
        {phrases[idx]}
      </p>
    </div>
  );
}

function TabBar({
  active,
  chapters,
  onSelect,
}: {
  active: SingleTarget;
  chapters: Record<SingleTarget, ChapterState>;
  onSelect: (t: SingleTarget) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Generated chapters"
      className="flex gap-1 rounded-md border border-border/40 bg-muted/30 p-1"
    >
      {ALL_TARGETS.map((t) => {
        const status: ChapterStatus = chapters[t]?.status ?? "idle";
        const selected = t === active;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(t)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-xs font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
              selected
                ? "bg-amber-500 text-amber-950 shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Ch {t}</span>
            {status === "streaming" && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {status === "done" && <Check className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}

function ChapterActions({
  content,
  target,
  title,
}: {
  content: string;
  target: SingleTarget;
  title: string;
}) {
  const [justCopied, setJustCopied] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const disabled = content.length === 0;

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40)
      .replace(/^-+|-+$/g, "") || "chapter";
  const baseFilename = `${slug}-chapter-${target}`;

  const handleCopy = async () => {
    const ok = await copyText(content);
    if (ok) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1800);
      trackEvent("chapter_copied", { chapter: target });
    }
  };

  const handleDownloadMd = () => {
    triggerDownload(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
      `${baseFilename}.md`,
    );
    trackEvent("chapter_exported", { format: "md", chapter: target });
  };

  const handleDownloadDocx = async () => {
    setIsExportingDocx(true);
    setExportError(null);
    try {
      // Rasterize each chart to both SVG (vector) and PNG (fallback) so
      // the docx export can prefer vector when Word supports it.
      const { png, svg } = await rasterizeChartsInArticle();
      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: content,
          chapterTitle: `${title} — Chapter ${target}`,
          filename: baseFilename,
          chartImages: png,
          chartSvgs: svg,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      triggerDownload(blob, `${baseFilename}.docx`);
      trackEvent("chapter_exported", { format: "docx", chapter: target });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
      setTimeout(() => setExportError(null), 4000);
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handlePrintPdf = () => {
    // The browser's print dialog has a "Save as PDF" destination on every
    // major OS. Cheaper than embedding a PDF library and produces the
    // cleanest output via our @media print stylesheet.
    trackEvent("chapter_exported", { format: "pdf", chapter: target });
    window.print();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        disabled={disabled}
      >
        {justCopied ? (
          <Check className="h-3 w-3 text-amber-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {justCopied ? "Copied" : "Copy"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadMd}
        disabled={disabled}
      >
        <Download className="h-3 w-3" />
        .md
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadDocx}
        disabled={disabled || isExportingDocx}
      >
        {isExportingDocx ? (
          <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
        ) : (
          <FileText className="h-3 w-3" />
        )}
        {isExportingDocx ? "Building…" : ".docx"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrintPdf}
        disabled={disabled}
      >
        <Printer className="h-3 w-3" />
        PDF
      </Button>
      {exportError && (
        <span className="text-xs text-destructive">{exportError}</span>
      )}
    </div>
  );
}

// ===========================================================================
// SVG → PNG rasterization for the .docx export
// ===========================================================================

/**
 * Walk every rendered `<figure data-chart-id>` and extract both an SVG
 * string (vector — used in modern Word) and a PNG raster (fallback for
 * older versions). The docx export route picks SVG when available with
 * the PNG as the required fallback.
 *
 * Failures are non-fatal — a chart that can't be rasterized is just
 * omitted from the docx; the markdown fence is dropped silently.
 */
async function rasterizeChartsInArticle(): Promise<{
  png: Record<string, string>;
  svg: Record<string, string>;
}> {
  const figures = document.querySelectorAll<HTMLElement>(
    "article figure[data-chart-id]",
  );
  const png: Record<string, string> = {};
  const svg: Record<string, string> = {};
  await Promise.all(
    Array.from(figures).map(async (fig) => {
      const id = fig.dataset.chartId;
      if (!id) return;
      const svgEl = fig.querySelector("svg");
      if (!svgEl) return;
      try {
        const xml = serializeSvg(svgEl);
        svg[id] = xml;
        const rasterized = await svgToPng(svgEl, 1000, 560);
        png[id] = rasterized;
      } catch {
        // Skip this chart — docx export will lack this image.
      }
    }),
  );
  return { png, svg };
}

function serializeSvg(svg: SVGSVGElement): string {
  const xml = new XMLSerializer().serializeToString(svg);
  return xml.includes("xmlns=")
    ? xml
    : xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Convert an SVG element to a base64-encoded PNG at the requested size. */
async function svgToPng(
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<string> {
  // Recharts emits SVGs sized in CSS pixels; serialize as-is.
  const serializer = new XMLSerializer();
  const xml = serializer.serializeToString(svg);
  // Some browsers refuse to load SVG without the xmlns attribute.
  const xmlWithNs = xml.includes("xmlns=")
    ? xml
    : xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const svgBlob = new Blob([xmlWithNs], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.split(",")[1] ?? "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/** Clipboard write with a `document.execCommand` fallback for older Safari. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// ===========================================================================
// Markdown component map — academic paper styling with editorial dark palette
// ===========================================================================

type MdProps<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

const markdownComponents = {
  h1: (props: MdProps<"h1">) => (
    <h1
      className="mb-6 mt-0 font-serif text-3xl tracking-tight text-amber-600"
      {...props}
    />
  ),
  h2: (props: MdProps<"h2">) => (
    <h2
      className="mb-3 mt-8 font-serif text-2xl tracking-tight text-amber-700"
      {...props}
    />
  ),
  h3: (props: MdProps<"h3">) => (
    <h3 className="mb-2 mt-6 font-serif text-lg" {...props} />
  ),
  h4: (props: MdProps<"h4">) => (
    <h4 className="mb-2 mt-5 font-medium" {...props} />
  ),
  p: (props: MdProps<"p">) => (
    <p className="my-3 leading-7 text-foreground/90" {...props} />
  ),
  strong: (props: MdProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: MdProps<"em">) => <em className="italic" {...props} />,
  ul: (props: MdProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-6" {...props} />
  ),
  ol: (props: MdProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-6" {...props} />
  ),
  li: (props: MdProps<"li">) => (
    <li className="leading-7 text-foreground/90" {...props} />
  ),
  blockquote: (props: MdProps<"blockquote">) => (
    <blockquote
      className="my-4 border-l-2 border-amber-500/40 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  code: (props: MdProps<"code"> & { children?: React.ReactNode }) => {
    const className = props.className ?? "";
    // Detect ```chart fenced blocks and render the spec via Recharts.
    if (/language-chart/.test(className)) {
      const raw =
        typeof props.children === "string"
          ? props.children
          : Array.isArray(props.children)
            ? props.children.filter((c) => typeof c === "string").join("")
            : "";
      const spec = parseChartSpec(raw);
      if (spec) return <Chart spec={spec} />;
      // Fall through to a styled error code if JSON didn't parse — usually
      // because the stream is still arriving mid-fence.
      return (
        <code className="font-mono text-[11px] text-muted-foreground">
          [chart loading…]
        </code>
      );
    }
    return (
      <code
        className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[12px]"
        {...props}
      />
    );
  },
  // Override `pre` so chart fences don't get wrapped in a code block frame.
  pre: (props: MdProps<"pre"> & { children?: React.ReactNode }) => {
    const child = props.children;
    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      "props" in (child as object)
    ) {
      const cls = ((child as { props?: { className?: string } }).props
        ?.className ?? "");
      if (/language-chart/.test(cls)) {
        // Skip the <pre> wrap — return just the rendered chart from `code`.
        return <>{child}</>;
      }
    }
    return (
      <pre
        className="my-4 overflow-x-auto rounded border border-border/40 bg-muted/40 p-3 font-mono text-[11px]"
        {...props}
      />
    );
  },
  table: (props: MdProps<"table">) => (
    <div className="my-6 overflow-x-auto rounded border border-border/40">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props: MdProps<"thead">) => (
    <thead className="bg-muted/40 font-mono text-xs uppercase tracking-wider" {...props} />
  ),
  tbody: (props: MdProps<"tbody">) => <tbody {...props} />,
  tr: (props: MdProps<"tr">) => (
    <tr className="border-t border-border/30" {...props} />
  ),
  th: (props: MdProps<"th">) => (
    <th className="px-3 py-2 text-left font-medium" {...props} />
  ),
  td: (props: MdProps<"td">) => (
    <td className="px-3 py-2 font-mono text-xs" {...props} />
  ),
  hr: (props: MdProps<"hr">) => (
    <hr className="my-8 border-border/40" {...props} />
  ),
  a: (props: MdProps<"a">) => (
    <a
      className="text-amber-700 underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-400"
      {...props}
    />
  ),
};
