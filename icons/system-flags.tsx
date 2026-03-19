import type { SVGProps } from "react";

export function SystemFlagsIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 3v18" />
      <path d="M5 4h11l-2 3 2 3H5" />
    </svg>
  );
}
