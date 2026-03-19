import type { SVGProps } from "react";

export function PrelaunchRocketIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M14 4c2.5 0 5 2.5 5 5-2.2 0-4.3.8-5.8 2.2L11 13.5C9.8 12.3 9 10.2 9 8c0-2.2 2.8-4 5-4z" />
      <path d="M11 13l-4 4" />
      <path d="M7 17l-1 4 4-1" />
      <circle cx="14.5" cy="8.5" r="1.2" />
    </svg>
  );
}
