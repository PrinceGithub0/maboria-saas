import type { SVGProps } from "react";

export function AutomationsFlowIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="5" cy="18" r="2" />
      <path d="M7 6h5a3 3 0 0 1 3 3" />
      <path d="M7 18h5a3 3 0 0 0 3-3" />
      <path d="M16.5 12H17" />
    </svg>
  );
}
