import type { SVGProps } from "react";

export function SubscriptionRefreshIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="8" />
      <path d="M15.5 9.5V6.5h-3" />
      <path d="M8.5 14.5v3h3" />
      <path d="M8.8 9.7A4 4 0 0 1 15.5 9.5" />
      <path d="M15.2 14.3A4 4 0 0 1 8.5 14.5" />
    </svg>
  );
}
