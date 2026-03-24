"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";

type Props = {
  data: { name: string; value: number }[];
  className?: string;
  style?: React.CSSProperties;
  forceAllTicks?: boolean;
  xAxisAngle?: number;
  xAxisHeight?: number;
  xAxisTickFontSize?: number;
  xAxisInterval?: number | "preserveStartEnd";
  xAxisMinTickGap?: number;
  xAxisTickFormatter?: (value: string) => string;
};

export function MiniAreaChart({
  data,
  className,
  style,
  forceAllTicks,
  xAxisAngle,
  xAxisHeight,
  xAxisTickFontSize,
  xAxisInterval,
  xAxisMinTickGap,
  xAxisTickFormatter,
}: Props) {
  const angle = xAxisAngle ?? (forceAllTicks ? -35 : 0);
  const height = xAxisHeight ?? 40;
  const fontSize = xAxisTickFontSize ?? 10;
  const interval = xAxisInterval ?? (forceAllTicks ? 0 : "preserveStartEnd");
  const minTickGap = xAxisMinTickGap ?? (forceAllTicks ? 0 : 6);

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: ReadonlyArray<{ value?: number | string }>;
    label?: string | number;
  }) => {
    if (!active || !payload?.length) return null;
    const value = Number(payload[0]?.value ?? 0);

    return (
      <div className="rounded-xl border border-border/80 bg-popover px-3 py-2 shadow-xl ring-1 ring-black/5 backdrop-blur-sm dark:ring-white/5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label || "--"}
        </p>
        <p className="mt-1 whitespace-nowrap text-sm font-semibold text-foreground tabular-nums">
          Value: {Number.isFinite(value) ? value.toLocaleString() : "--"}
        </p>
      </div>
    );
  };

  return (
    <div className={clsx("h-40 w-full min-h-[200px]", className)} style={style}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-primary, #6366f1)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--chart-primary, #6366f1)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.25} vertical={false} />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize }}
            interval={interval}
            minTickGap={minTickGap}
            tickMargin={6}
            padding={{ left: 12, right: 12 }}
            angle={angle}
            textAnchor="end"
            height={height}
            tickFormatter={xAxisTickFormatter}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeOpacity: 0.5 }}
            content={renderTooltip}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-primary, #6366f1)"
            fill="url(#chartGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
