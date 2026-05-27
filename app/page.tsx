"use client";

import { useMemo, useState } from "react";
import { AnalysisMapping } from "@/components/AnalysisMapping";
import { ChapterViewer } from "@/components/ChapterViewer";
import { FileUpload } from "@/components/FileUpload";
import { IntakeForm, type FormErrors, type FormState } from "@/components/IntakeForm";
import { StatsSummary } from "@/components/StatsSummary";
import type {
  AnalysisMappings,
  ChapterTarget,
  IntakeFormData,
  ParsedDataset,
  StatResult,
} from "@/types";

const EMPTY_DATASET: ParsedDataset = {
  headers: [],
  rows: [],
  numerics: [],
  categoricals: [],
  n: 0,
};

const EMPTY_MAPPINGS: AnalysisMappings = {
  objectives: {},
  hypotheses: {},
};

const DEFAULT_FORM: FormState = {
  title: "",
  level: "undergraduate",
  institution: "",
  objectivesText: "",
  hypothesesText: "",
  instrument: "questionnaire",
  sampleSize: "",
  description: "",
  likertPoints: 5,
  chapterTarget: "4",
};

function fileRequiredFor(target: ChapterTarget): boolean {
  return target === "4" || target === "5" || target === "all";
}

function validate(form: FormState, hasFile: boolean): FormErrors {
  const errs: FormErrors = {};
  if (form.title.trim().length < 10) {
    errs.title = "Project title must be at least 10 characters.";
  }
  const objectives = parseLines(form.objectivesText);
  if (objectives.length === 0) {
    errs.objectivesText = "List at least one research objective.";
  }
  if (!form.level) {
    errs.level = "Select a research level.";
  }
  if (fileRequiredFor(form.chapterTarget) && !hasFile) {
    errs.chapterTarget = "Upload your data file for this chapter target.";
  }
  return errs;
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Convert the form working buffer into the canonical `IntakeFormData`. */
function buildIntake(form: FormState): IntakeFormData {
  return {
    title: form.title.trim(),
    level: form.level,
    institution: form.institution.trim(),
    objectives: parseLines(form.objectivesText),
    hypotheses: parseLines(form.hypothesesText),
    instrument: form.instrument,
    sampleSize: Number(form.sampleSize) || 0,
    description: form.description.trim(),
    likertPoints: form.likertPoints,
    chapterTarget: form.chapterTarget,
  };
}

export default function HomePage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [stats, setStats] = useState<StatResult[] | null>(null);
  const [parsedFilename, setParsedFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mappings, setMappings] = useState<AnalysisMappings>(EMPTY_MAPPINGS);
  /** Frozen at submit time so later form edits don't mutate an in-flight run. */
  const [submission, setSubmission] = useState<{
    intake: IntakeFormData;
    dataset: ParsedDataset;
    stats: StatResult[];
    mappings: AnalysisMappings;
  } | null>(null);

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "intake",
        JSON.stringify({ likertPoints: form.likertPoints }),
      );
      const res = await fetch("/api/parse-data", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Parse failed (${res.status})`);
      }
      const json = (await res.json()) as {
        dataset: ParsedDataset;
        stats: StatResult[];
      };
      setDataset(json.dataset);
      setStats(json.stats);
      setParsedFilename(file.name);
      setForm((f) => ({ ...f, sampleSize: String(json.dataset.n) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse failed";
      setParseError(msg);
      setDataset(null);
      setStats(null);
      setParsedFilename(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleClearFile = () => {
    setDataset(null);
    setStats(null);
    setParsedFilename(null);
    setParseError(null);
    // Drop stale column references so a new upload doesn't reuse them.
    setMappings(EMPTY_MAPPINGS);
  };

  const updateForm = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const hasFile = dataset !== null;
  const errors = validate(form, hasFile);
  const canSubmit = Object.keys(errors).length === 0 && !isParsing;

  const handleSubmit = () => {
    const intake = buildIntake(form);
    setSubmission({
      intake,
      dataset: dataset ?? EMPTY_DATASET,
      stats: stats ?? [],
      mappings,
    });
    setIsGenerating(true);
    // Smooth-scroll to top so the chapter viewer enters at the top edge.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleResetGeneration = () => {
    setIsGenerating(false);
    setSubmission(null);
  };

  const compactHero = useMemo(() => isGenerating, [isGenerating]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10 md:py-16">
        <Hero compact={compactHero} />
        {isGenerating && submission ? (
          <ChapterViewer
            intake={submission.intake}
            dataset={submission.dataset}
            stats={submission.stats}
            mappings={submission.mappings}
            chapterTarget={submission.intake.chapterTarget}
            onReset={handleResetGeneration}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-8">
            <div className="space-y-5">
              <FileUpload
                parsedFilename={parsedFilename}
                parsedN={dataset?.n ?? null}
                isParsing={isParsing}
                error={parseError}
                onFile={handleFile}
                onClear={handleClearFile}
              />
              <StatsSummary dataset={dataset} stats={stats} />
              <AnalysisMapping
                dataset={dataset}
                objectives={parseLines(form.objectivesText)}
                hypotheses={parseLines(form.hypothesesText)}
                value={mappings}
                onChange={setMappings}
              />
            </div>
            <IntakeForm
              value={form}
              errors={errors}
              onChange={updateForm}
              onSubmit={handleSubmit}
              canSubmit={canSubmit}
              hasFile={hasFile}
            />
          </div>
        )}
      </main>
      <footer className="mt-16 border-t border-border/60 py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="flourish mb-4 text-xs">
            <span aria-hidden>◆</span>
          </div>
          <p className="font-serif text-sm italic text-muted-foreground">
            KejiAI — Real statistics, real interpretation, no signup.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rotate-45 bg-amber-600"
          />
          <span className="font-serif text-xl tracking-tight text-foreground">
            Keji<span className="text-amber-600">AI</span>
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.16em] text-muted-foreground md:inline">
            Statistical interpretation for academic writers
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-amber-600" />
          stateless · no signup
        </div>
      </div>
    </header>
  );
}

function Hero({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <section className="mb-8 text-center">
        <h1 className="font-serif text-3xl tracking-tight md:text-4xl">
          <span className="text-amber-600">Your chapter</span> is being
          written.
        </h1>
      </section>
    );
  }
  return (
    <section className="mb-12 text-center md:mb-20">
      <h1 className="font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
        Your data.{" "}
        <span className="italic text-amber-700">Your chapters.</span>
        <br />
        <span className="text-foreground/80">Under 60 seconds.</span>
      </h1>
      <div className="flourish my-7 text-xs">
        <span aria-hidden>◆</span>
      </div>
      <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
        Upload your research data. Describe the study. Receive a fully
        written, APA-formatted academic chapter — with real statistics, real
        tables, and real charts — calibrated to your academic level.
      </p>
    </section>
  );
}
