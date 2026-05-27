"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEVEL_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  ChapterTarget,
  LikertScalePoints,
  ResearchInstrument,
  ResearchLevel,
} from "@/types";

/** Working buffer shape — strings everywhere for clean controlled inputs. */
export interface FormState {
  title: string;
  level: ResearchLevel;
  institution: string;
  /** Raw textarea text. Lines become objectives at submission time. */
  objectivesText: string;
  /** Raw textarea text. Lines become hypotheses at submission time. */
  hypothesesText: string;
  instrument: ResearchInstrument;
  /** String for `<input type="number">`. Parsed at submit. */
  sampleSize: string;
  description: string;
  likertPoints: LikertScalePoints;
  chapterTarget: ChapterTarget;
}

export type FormErrors = Partial<Record<keyof FormState, string>>;

interface IntakeFormProps {
  value: FormState;
  errors: FormErrors;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  /** True while a chapter is generating (Phase 4). */
  isSubmitting?: boolean;
  /** Whether the user has uploaded data (controls "file required" copy). */
  hasFile: boolean;
}

const INSTRUMENT_LABELS: Record<ResearchInstrument, string> = {
  questionnaire: "Questionnaire",
  interview: "Interview",
  observation: "Observation",
  "secondary-data": "Secondary Data",
};

const LIKERT_OPTIONS: { value: LikertScalePoints; label: string }[] = [
  { value: 4, label: "4-point" },
  { value: 5, label: "5-point" },
  { value: 7, label: "7-point" },
];

const CHAPTER_OPTIONS: { value: ChapterTarget; label: string }[] = [
  { value: "1", label: "Ch 1" },
  { value: "2", label: "Ch 2" },
  { value: "3", label: "Ch 3" },
  { value: "4", label: "Ch 4" },
  { value: "5", label: "Ch 5" },
  { value: "all", label: "All" },
];

/** Chapter targets that require uploaded data. */
function requiresFile(t: ChapterTarget): boolean {
  return t === "4" || t === "5" || t === "all";
}

export function IntakeForm({
  value,
  errors,
  onChange,
  onSubmit,
  canSubmit,
  isSubmitting,
  hasFile,
}: IntakeFormProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const markTouched = (field: keyof FormState) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));

  const shouldShow = (field: keyof FormState) =>
    Boolean(errors[field]) && (touched[field] || submitAttempted);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (canSubmit) onSubmit();
  };

  const fileNeeded = requiresFile(value.chapterTarget);
  const fileHint = fileNeeded
    ? hasFile
      ? "Data file attached ·  needed for this chapter."
      : "Upload your data file — needed for this chapter."
    : "Data file is optional for this chapter.";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-xl border border-border/60 bg-card/70 p-6 shadow-sm shadow-amber-900/[0.03] md:p-8 space-y-5"
    >
      <header className="space-y-2 border-b border-border/50 pb-5">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-700">
          <span className="h-1 w-1 rounded-full bg-amber-600" />
          Step 02
        </div>
        <h2 className="font-serif text-3xl tracking-tight">Research intake</h2>
        <p className="text-sm text-muted-foreground">
          Tell KejiAI what you&apos;re working on. Required fields are
          marked in amber.
        </p>
      </header>

      <Field
        id="level"
        label="Research Level"
        required
        error={shouldShow("level") ? errors.level : undefined}
      >
        <Select
          value={value.level}
          onValueChange={(v) => {
            onChange({ level: v as ResearchLevel });
            markTouched("level");
          }}
        >
          <SelectTrigger id="level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(LEVEL_LABELS) as [ResearchLevel, string][]
            ).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="title"
        label="Project Title"
        required
        error={shouldShow("title") ? errors.title : undefined}
      >
        <Input
          id="title"
          value={value.title}
          placeholder="An assessment of e-learning adoption among undergraduates"
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={() => markTouched("title")}
        />
      </Field>

      <Field id="institution" label="Institution" optional>
        <Input
          id="institution"
          value={value.institution}
          placeholder="optional"
          onChange={(e) => onChange({ institution: e.target.value })}
        />
      </Field>

      <Field
        id="objectives"
        label="Research Objectives"
        required
        hint="One per line, numbered"
        error={
          shouldShow("objectivesText") ? errors.objectivesText : undefined
        }
      >
        <Textarea
          id="objectives"
          value={value.objectivesText}
          rows={4}
          placeholder={`1. To examine the level of e-learning adoption
2. To identify barriers to adoption
3. To assess the impact on academic performance`}
          onChange={(e) => onChange({ objectivesText: e.target.value })}
          onBlur={() => markTouched("objectivesText")}
          className="font-mono text-xs leading-6"
        />
      </Field>

      <Field
        id="hypotheses"
        label="Hypotheses"
        optional
        hint="One per line — only if applicable"
      >
        <Textarea
          id="hypotheses"
          value={value.hypothesesText}
          rows={3}
          placeholder={`Ho1: There is no significant relationship between …
Ho2: …`}
          onChange={(e) => onChange({ hypothesesText: e.target.value })}
          className="font-mono text-xs leading-6"
        />
      </Field>

      <Field id="instrument" label="Research Instrument">
        <Select
          value={value.instrument}
          onValueChange={(v) =>
            onChange({ instrument: v as ResearchInstrument })
          }
        >
          <SelectTrigger id="instrument">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(INSTRUMENT_LABELS) as [
                ResearchInstrument,
                string,
              ][]
            ).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="sampleSize"
        label="Sample Size"
        hint={hasFile ? "Auto-filled from your data" : "Override the parsed N if needed"}
      >
        <Input
          id="sampleSize"
          type="number"
          inputMode="numeric"
          min={1}
          value={value.sampleSize}
          onChange={(e) => onChange({ sampleSize: e.target.value })}
          className="font-mono"
        />
      </Field>

      <Field
        id="description"
        label="Brief Description"
        hint="2–5 sentences about the study"
      >
        <Textarea
          id="description"
          value={value.description}
          rows={4}
          placeholder="Describe the study setting, who you surveyed, and what you set out to learn."
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>

      <Field label="Likert Scale Points">
        <Segmented
          options={LIKERT_OPTIONS}
          value={value.likertPoints}
          onChange={(v) => onChange({ likertPoints: v as LikertScalePoints })}
          ariaLabel="Likert scale points"
        />
      </Field>

      <Field
        label="Chapter Target"
        hint={fileHint}
        error={
          shouldShow("chapterTarget") ? errors.chapterTarget : undefined
        }
      >
        <Segmented
          options={CHAPTER_OPTIONS}
          value={value.chapterTarget}
          onChange={(v) => onChange({ chapterTarget: v as ChapterTarget })}
          ariaLabel="Chapter target"
        />
      </Field>

      <div className="pt-2">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit || isSubmitting}
          className={cn(
            "group relative w-full overflow-hidden font-medium tracking-wide text-amber-50 shadow-md shadow-amber-900/20 transition-all duration-200",
            "bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 hover:shadow-lg hover:shadow-amber-900/25",
            "focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2",
            "disabled:from-amber-600/40 disabled:to-amber-700/40 disabled:shadow-none",
          )}
        >
          <span className="relative z-10 flex items-center justify-center gap-2 font-serif text-base">
            {isSubmitting ? "Generating…" : "Generate Chapter"}
            {!isSubmitting && (
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            )}
          </span>
        </Button>
        {!canSubmit && submitAttempted && (
          <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Fill the required fields above to enable generation
          </p>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Helpers — kept inline so IntakeForm stays self-contained.
// ---------------------------------------------------------------------------

interface FieldProps {
  id?: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function Field({ id, label, required, optional, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
      >
        <span className="text-sm">{label}</span>
        {required && (
          <span className="text-[10px] uppercase tracking-wider text-amber-600">
            required
          </span>
        )}
        {optional && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            optional
          </span>
        )}
        {hint && !error && (
          <span className="text-xs text-muted-foreground">— {hint}</span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-md border border-border/40 bg-muted/30 p-1"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 min-w-fit rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
              selected
                ? "bg-amber-500 text-amber-950 shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
