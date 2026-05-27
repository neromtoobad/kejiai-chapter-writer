"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ParsedDataset, StatResult } from "@/types";

interface StatsSummaryProps {
  dataset: ParsedDataset | null;
  stats: StatResult[] | null;
}

export function StatsSummary({ dataset, stats }: StatsSummaryProps) {
  if (!dataset) return null;

  const likertCandidates = (stats ?? []).filter(
    (s) => s.decision !== undefined,
  );

  return (
    <Card className="space-y-5 border-border/60 bg-card/70 p-6 shadow-sm shadow-amber-900/[0.03]">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-700">
            Sample Size
          </div>
          <div className="mt-1 font-serif text-5xl leading-none text-foreground">
            {dataset.n}
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          respondents
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Variables" value={dataset.headers.length} />
        <Stat label="Numeric" value={dataset.numerics.length} />
        <Stat label="Categorical" value={dataset.categoricals.length} />
      </div>

      {dataset.numerics.length > 0 && (
        <VarBlock title="Numeric columns" names={dataset.numerics} tone="numeric" />
      )}
      {dataset.categoricals.length > 0 && (
        <VarBlock
          title="Categorical columns"
          names={dataset.categoricals}
          tone="categorical"
        />
      )}

      {likertCandidates.length > 0 && (
        <div className="border-t border-border/40 pt-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Likert candidates
          </div>
          <div className="mt-1.5 text-sm text-amber-800/80">
            {likertCandidates.length} variable
            {likertCandidates.length === 1 ? "" : "s"} look like Likert items
            (integer values within the chosen scale).
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {likertCandidates.map((s) => (
              <Badge
                key={s.variable}
                className="bg-amber-500/15 font-mono text-[11px] text-amber-800 hover:bg-amber-500/15"
              >
                {s.variable} · μ={s.mean.toFixed(2)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}

function VarBlock({
  title,
  names,
  tone,
}: {
  title: string;
  names: string[];
  tone: "numeric" | "categorical";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {names.map((n) => (
          <Badge
            key={n}
            variant={tone === "numeric" ? "secondary" : "outline"}
            className="font-mono text-[11px]"
          >
            {n}
          </Badge>
        ))}
      </div>
    </div>
  );
}
