// Hand-set icons. Single 1.4 stroke, rounded caps, never filled.
// Lucide is intentionally off-limits per design-system/DESIGN.md §7.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export const IconArrow = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 10h11" />
    <path d="M11 5.5l4.5 4.5L11 14.5" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 3v10" />
    <path d="M5.5 8.5L10 13l4.5-4.5" />
    <path d="M4 16h12" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8.5 4.5H4.5v11h11v-4" />
    <path d="M11 4.5h4.5V9" />
    <path d="M9 11l6.5-6.5" />
  </svg>
);

export const IconGithub = (p: IconProps) => (
  <svg {...base({ ...p, viewBox: "0 0 24 24", strokeWidth: 1.2 })}>
    <path d="M9 19c-4 1.5-4-2-6-2.5" />
    <path d="M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.5 4.5 0 0 0-1.2-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.5 1.3a12 12 0 0 0-6.4 0C6.3 2 5.3 2.3 5.3 2.3a4.2 4.2 0 0 0-.1 3.2A4.5 4.5 0 0 0 4 8.7c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  </svg>
);

export const IconMic = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
    <path d="M5 9.5a5 5 0 0 0 10 0" />
    <path d="M10 14.5V17" />
  </svg>
);

export const IconPhoto = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="14" height="11" rx="1.5" />
    <circle cx="7.5" cy="8.5" r="1" />
    <path d="M3.5 13l4-3.5 4 3 3-2 2 1.5" />
  </svg>
);

export const IconNote = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 3.5h7.5L16 7v9.5H5z" />
    <path d="M12.5 3.5V7H16" />
    <path d="M7.5 9.5h5M7.5 12h5M7.5 14h3" />
  </svg>
);

export const IconVideo = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="11" height="9" rx="1.5" />
    <path d="M14 8l3-1.5v7L14 12" />
  </svg>
);

export const IconLock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.5" y="9" width="11" height="7" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);

export const IconLetter = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="14" height="10" rx="1" />
    <path d="M3.5 5.5L10 10l6.5-4.5" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="9" r="4.5" />
    <path d="M12.5 12.5L16 16" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

export const IconChevron = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 5l5 5-5 5" />
  </svg>
);

// Apple logo (filled glyph, not stroked - the Apple mark is iconic this way).
export const IconApple = ({ size = 18, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden
    {...rest}
  >
    <path d="M13.05 10.86c-.02-2.06 1.69-3.05 1.77-3.1-.97-1.41-2.47-1.6-3-1.62-1.27-.13-2.48.75-3.13.75-.66 0-1.65-.73-2.71-.71-1.39.02-2.69.81-3.41 2.06-1.46 2.52-.37 6.23 1.04 8.27.7 1 1.51 2.12 2.57 2.08 1.04-.04 1.43-.67 2.69-.67 1.26 0 1.6.67 2.7.65 1.11-.02 1.82-1.02 2.5-2.02.78-1.15 1.1-2.26 1.12-2.32-.02-.01-2.15-.83-2.14-3.28zM11.14 5.04c.57-.7.96-1.66.85-2.62-.83.04-1.83.55-2.42 1.24-.53.61-1 1.59-.87 2.53.92.07 1.87-.46 2.44-1.15z" />
  </svg>
);
