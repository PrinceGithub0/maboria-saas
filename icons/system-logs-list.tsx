import type { SVGProps } from "react";

export function SystemLogsListIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="6" cy="7" r="1" />
      <circle cx="6" cy="12" r="1" />
      <circle cx="6" cy="17" r="1" />
      <path d="M10 7h8" />
      <path d="M10 12h8" />
      <path d="M10 17h8" />
    </svg>
  );
}
