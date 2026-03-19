import type { SVGProps } from "react";

export function AutomationOperationsPulseIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 12h4l2-3 3 6 2-4h3" />
      <circle cx="18" cy="11" r="2" />
      <path d="M20 11h1" />
    </svg>
  );
}
