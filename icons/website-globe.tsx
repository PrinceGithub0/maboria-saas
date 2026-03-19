import type { SVGProps } from "react";

export function WebsiteGlobeIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8h18" />
      <circle cx="12" cy="14" r="4" />
      <path d="M8 14h8" />
      <path d="M12 10c-1.5 1.2-2.5 2.6-2.5 4s1 2.8 2.5 4" />
      <path d="M12 10c1.5 1.2 2.5 2.6 2.5 4s-1 2.8-2.5 4" />
    </svg>
  );
}
