import type { SVGProps } from "react";

export function AutomationErrorsFlowWarningIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="5" cy="6" r="2" />
      <circle cx="13" cy="12" r="2" />
      <path d="M7 6h3a3 3 0 0 1 3 3v1" />
      <path d="M17 18h5l-2.5-4.5L17 18z" />
      <path d="M19.5 16v.01" />
      <path d="M19.5 14.2v1" />
    </svg>
  );
}
