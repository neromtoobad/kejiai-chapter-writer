"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BarChartSpec,
  ChartSpec,
  GroupBarChartSpec,
  PieChartSpec,
  ScatterChartSpec,
} from "@/types";

/** Amber palette for KejiAI charts. */
const PALETTE = [
  "#d97706", // amber-600 — primary
  "#92400e", // amber-800
  "#f59e0b", // amber-500
  "#78350f", // amber-900
  "#fbbf24", // amber-400
  "#451a03", // amber-950
  "#fcd34d", // amber-300
  "#fde68a", // amber-200
];

const AXIS_TICK = { fontSize: 11, fill: "#475569" }; // slate-600
const GRID = { stroke: "#e2e8f0" }; // slate-200
const TOOLTIP_STYLE = {
  fontSize: 12,
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
};

const CHART_HEIGHT = 280;

/** Top-level dispatcher. Returns a fully styled, captioned figure. */
export function Chart({ spec }: { spec: ChartSpec }) {
  return (
    <figure
      className="my-6 rounded-lg border border-border/40 bg-white p-4"
      data-chart-id={spec.id}
      data-chart-caption={spec.caption}
    >
      <div style={{ width: "100%", height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderInner(spec)}
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {spec.caption}
      </figcaption>
    </figure>
  );
}

function renderInner(spec: ChartSpec): React.ReactElement {
  switch (spec.kind) {
    case "pie":
      return renderPie(spec);
    case "bar":
      return renderBar(spec);
    case "groupBar":
      return renderGroupBar(spec);
    case "scatter":
      return renderScatter(spec);
  }
}

function renderPie(spec: PieChartSpec) {
  const total = spec.data.reduce((s, d) => s + d.value, 0);
  return (
    <PieChart>
      <Pie
        data={spec.data}
        dataKey="value"
        nameKey="label"
        cx="50%"
        cy="50%"
        outerRadius="75%"
        label={(entry: { name?: string; value?: number }) => {
          const v = Number(entry.value ?? 0);
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return `${entry.name ?? ""} (${pct}%)`;
        }}
        labelLine={false}
      >
        {spec.data.map((_d, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={(value, name) => {
          const num = Number(value);
          const pct = total > 0 ? Math.round((num / total) * 100) : 0;
          return [`${num} (${pct}%)`, String(name)];
        }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </PieChart>
  );
}

function renderBar(spec: BarChartSpec) {
  return (
    <BarChart
      data={spec.data}
      margin={{ top: 10, right: 16, bottom: 24, left: 0 }}
    >
      <CartesianGrid {...GRID} strokeDasharray="3 3" />
      <XAxis
        dataKey="category"
        tick={AXIS_TICK}
        label={{
          value: spec.xLabel,
          position: "insideBottom",
          offset: -10,
          fontSize: 11,
          fill: "#475569",
        }}
      />
      <YAxis
        tick={AXIS_TICK}
        label={{
          value: spec.yLabel,
          angle: -90,
          position: "insideLeft",
          fontSize: 11,
          fill: "#475569",
          offset: 12,
        }}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      <Bar dataKey="value" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
    </BarChart>
  );
}

function renderGroupBar(spec: GroupBarChartSpec) {
  return (
    <BarChart
      data={spec.data}
      margin={{ top: 10, right: 16, bottom: 24, left: 0 }}
    >
      <CartesianGrid {...GRID} strokeDasharray="3 3" />
      <XAxis
        dataKey="group"
        tick={AXIS_TICK}
        label={{
          value: spec.xLabel,
          position: "insideBottom",
          offset: -10,
          fontSize: 11,
          fill: "#475569",
        }}
      />
      <YAxis
        tick={AXIS_TICK}
        label={{
          value: spec.yLabel,
          angle: -90,
          position: "insideLeft",
          fontSize: 11,
          fill: "#475569",
          offset: 12,
        }}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      <Bar dataKey="mean" fill={PALETTE[0]} radius={[4, 4, 0, 0]}>
        {spec.data.map((_d, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Bar>
    </BarChart>
  );
}

function renderScatter(spec: ScatterChartSpec) {
  return (
    <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
      <CartesianGrid {...GRID} strokeDasharray="3 3" />
      <XAxis
        type="number"
        dataKey="x"
        name={spec.xLabel}
        tick={AXIS_TICK}
        label={{
          value: spec.xLabel,
          position: "insideBottom",
          offset: -10,
          fontSize: 11,
          fill: "#475569",
        }}
      />
      <YAxis
        type="number"
        dataKey="y"
        name={spec.yLabel}
        tick={AXIS_TICK}
        label={{
          value: spec.yLabel,
          angle: -90,
          position: "insideLeft",
          fontSize: 11,
          fill: "#475569",
          offset: 12,
        }}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        cursor={{ strokeDasharray: "3 3" }}
      />
      <Scatter data={spec.data} fill={PALETTE[0]} />
    </ScatterChart>
  );
}

/**
 * Attempt to parse a fence body as a ChartSpec. Returns null if invalid.
 * Used by the markdown renderer in `ChapterViewer`.
 */
export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (
      parsed &&
      typeof parsed === "object" &&
      "kind" in parsed &&
      Array.isArray((parsed as { data?: unknown }).data)
    ) {
      const k = (parsed as { kind: unknown }).kind;
      if (k === "pie" || k === "bar" || k === "groupBar" || k === "scatter") {
        return parsed as ChartSpec;
      }
    }
    return null;
  } catch {
    return null;
  }
}
