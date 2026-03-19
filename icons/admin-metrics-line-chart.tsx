import type { SVGProps } from "react";

export function AdminMetricsLineChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 19h18" />
      <path d="M5 15l4-4 3 3 6-7" />
      <circle cx="5" cy="15" r="1" />
      <circle cx="9" cy="11" r="1" />
      <circle cx="12" cy="14" r="1" />
      <circle cx="18" cy="7" r="1" />
    </svg>
  );
}
