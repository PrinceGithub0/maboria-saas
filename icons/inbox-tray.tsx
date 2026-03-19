import type { SVGProps } from "react";

export function InboxTrayIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 6h18l-1.5 12H4.5L3 6z" />
      <path d="M3.5 14h5l1.5 2h4l1.5-2h5" />
      <path d="M9 10h6" />
    </svg>
  );
}
