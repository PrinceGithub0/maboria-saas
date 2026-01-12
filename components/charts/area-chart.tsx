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
};

export function MiniAreaChart({ data, className, style }: Props) {
  return (
    <div className={clsx("h-40 w-full min-h-[200px]", className)} style={style}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeOpacity: 0.5 }} />
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
