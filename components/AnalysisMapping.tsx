"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { inferTestKind } from "@/lib/runAnalyses";
import { cn } from "@/lib/utils";
import type {
  AnalysisMappings,
  HypothesisSpec,
  HypothesisTestKind,
  ParsedDataset,
} from "@/types";

interface AnalysisMappingProps {
  dataset: ParsedDataset | null;
  objectives: string[];
  hypotheses: string[];
  value: AnalysisMappings;
  /**
   * Functional setter — rapid toggles must read the latest committed state,
   * not the stale closed-over `value` prop. Matches `useState`'s setter shape.
   */
  onChange: (
    next:
      | AnalysisMappings
      | ((prev: AnalysisMappings) => AnalysisMappings),
  ) => void;
}

const TEST_LABEL: Record<HypothesisTestKind, string> = {
  none: "Not applicable",
  pearson: "Pearson r",
  ttest: "Welch's t-test",
  anova: "One-way ANOVA",
  chisquare: "Chi-square",
};

const TEST_EXPLAINER: Record<HypothesisTestKind, string> = {
  none: "Picks two variables to infer the test.",
  pearson: "Two numeric variables.",
  ttest: "Binary categorical group × numeric outcome.",
  anova: "3+ level categorical group × numeric outcome.",
  chisquare: "Two categorical variables.",
};

export function AnalysisMapping({
  dataset,
  objectives,
  hypotheses,
  value,
  onChange,
}: AnalysisMappingProps) {
  // Don't render until we have parsed data — there's nothing to map against.
  if (!dataset || dataset.n === 0) return null;
  if (objectives.length === 0 && hypotheses.length === 0) return null;

  const toggleObjectiveItem = (objIdx: number, column: string) => {
    onChange((prev) => {
      const current = prev.objectives[objIdx] ?? [];
      const next = current.includes(column)
        ? current.filter((c) => c !== column)
        : [...current, column];
      return {
        ...prev,
        objectives: { ...prev.objectives, [objIdx]: next },
      };
    });
  };

  const setItemText = (column: string, text: string) => {
    onChange((prev) => {
      const next = { ...(prev.itemTexts ?? {}) };
      const trimmed = text.trim();
      if (trimmed) next[column] = trimmed;
      else delete next[column];
      return { ...prev, itemTexts: next };
    });
  };

  const updateHypothesis = (
    hIdx: number,
    patch: Partial<HypothesisSpec>,
  ) => {
    onChange((prev) => {
      const prior = prev.hypotheses[hIdx] ?? {
        hypothesisIndex: hIdx,
        kind: "none" as HypothesisTestKind,
      };
      const next: HypothesisSpec = { ...prior, ...patch };
      // Re-infer the test kind when both variables are present.
      if (
        (patch.varA !== undefined || patch.varB !== undefined) &&
        dataset
      ) {
        next.kind = inferTestKind(dataset, next.varA, next.varB);
      }
      return {
        ...prev,
        hypotheses: { ...prev.hypotheses, [hIdx]: next },
      };
    });
  };

  return (
    <Card className="space-y-6 border-border/60 bg-card/70 p-6 shadow-sm shadow-amber-900/[0.03]">
      <header className="space-y-2 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-700">
          <span className="h-1 w-1 rounded-full bg-amber-600" />
          Step 03
        </div>
        <h2 className="font-serif text-2xl tracking-tight">
          Map your variables
        </h2>
        <p className="text-sm text-muted-foreground">
          Tell KejiAI which columns measure which objective and which
          variables relate to each hypothesis. Mapped columns drive
          Cronbach&apos;s α and hypothesis test results in Chapter 4.
        </p>
      </header>

      {objectives.length > 0 && dataset.numerics.length > 0 && (
        <section className="space-y-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Likert items per objective
          </div>
          {objectives.map((obj, i) => (
            <ObjectiveRow
              key={i}
              index={i}
              text={obj}
              numerics={dataset.numerics}
              selected={value.objectives[i] ?? []}
              itemTexts={value.itemTexts ?? {}}
              onToggle={(col) => toggleObjectiveItem(i, col)}
              onItemText={(col, t) => setItemText(col, t)}
            />
          ))}
        </section>
      )}

      {hypotheses.length > 0 && (
        <section className="space-y-4 border-t border-border/30 pt-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Hypothesis tests
          </div>
          {hypotheses.map((h, i) => (
            <HypothesisRow
              key={i}
              index={i}
              text={h}
              dataset={dataset}
              spec={
                value.hypotheses[i] ?? {
                  hypothesisIndex: i,
                  kind: "none",
                }
              }
              onChange={(patch) => updateHypothesis(i, patch)}
            />
          ))}
        </section>
      )}
    </Card>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function ObjectiveRow({
  index,
  text,
  numerics,
  selected,
  itemTexts,
  onToggle,
  onItemText,
}: {
  index: number;
  text: string;
  numerics: string[];
  selected: string[];
  itemTexts: Record<string, string>;
  onToggle: (column: string) => void;
  onItemText: (column: string, text: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm">
        <span className="text-amber-700">
          Obj {index + 1}:
        </span>{" "}
        <span className="text-foreground/90">{truncate(text, 100)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {numerics.map((col) => {
          const on = selected.includes(col);
          return (
            <button
              key={col}
              type="button"
              onClick={() => onToggle(col)}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[11px] transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                on
                  ? "border-amber-400 bg-amber-500/20 text-amber-900"
                  : "border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={on}
            >
              {col}
            </button>
          );
        })}
      </div>
      {selected.length >= 2 && (
        <div className="font-mono text-[11px] text-muted-foreground">
          {selected.length} items selected · α will be computed
        </div>
      )}
      {selected.length === 1 && (
        <div className="font-mono text-[11px] text-muted-foreground">
          1 item selected · α needs at least 2
        </div>
      )}
      {selected.length > 0 && (
        <div className="mt-2 space-y-1.5 rounded border border-border/40 bg-muted/20 p-2.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Item wording (optional, used in the Likert table)
          </div>
          <div className="space-y-1.5">
            {selected.map((col) => (
              <div key={col} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-[11px] text-amber-700">
                  {col}
                </span>
                <input
                  type="text"
                  value={itemTexts[col] ?? ""}
                  onChange={(e) => onItemText(col, e.target.value)}
                  placeholder={`e.g. "I use ${col} platforms regularly"`}
                  className="h-7 flex-1 rounded border border-border/50 bg-background px-2 text-xs focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HypothesisRow({
  index,
  text,
  dataset,
  spec,
  onChange,
}: {
  index: number;
  text: string;
  dataset: ParsedDataset;
  spec: HypothesisSpec;
  onChange: (patch: Partial<HypothesisSpec>) => void;
}) {
  const inferredKind = useMemo(
    () => inferTestKind(dataset, spec.varA, spec.varB),
    [dataset, spec.varA, spec.varB],
  );
  const headers = dataset.headers;

  return (
    <div className="space-y-2 rounded border border-border/30 bg-muted/10 p-3">
      <div className="text-sm">
        <span className="text-amber-700">Ho{index + 1}:</span>{" "}
        <span className="text-foreground/90">{truncate(text, 110)}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <VarSelect
          label="Variable 1"
          value={spec.varA}
          onChange={(v) => onChange({ varA: v })}
          headers={headers}
          dataset={dataset}
        />
        <VarSelect
          label="Variable 2"
          value={spec.varB}
          onChange={(v) => onChange({ varB: v })}
          headers={headers}
          dataset={dataset}
        />
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Inferred test:</span>
        <Badge
          className={cn(
            "font-mono",
            inferredKind === "none"
              ? "bg-muted/40 text-muted-foreground"
              : "bg-amber-500/15 text-amber-800 hover:bg-amber-500/15",
          )}
        >
          {TEST_LABEL[inferredKind]}
        </Badge>
        <span className="text-muted-foreground">
          — {TEST_EXPLAINER[inferredKind]}
        </span>
      </div>
    </div>
  );
}

function VarSelect({
  label,
  value,
  onChange,
  headers,
  dataset,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  headers: string[];
  dataset: ParsedDataset;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— none —</SelectItem>
          {headers.map((h) => {
            const isNumeric = dataset.numerics.includes(h);
            return (
              <SelectItem key={h} value={h} className="font-mono text-xs">
                {h}{" "}
                <span className="ml-1 text-[10px] uppercase opacity-60">
                  {isNumeric ? "num" : "cat"}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </label>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}
