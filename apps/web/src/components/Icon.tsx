import type { SVGProps } from 'react';

/** Line icons from the design mockups (24×24, stroke-based), plus a few extras. */
const paths = {
  leaf: (
    <>
      <path d="M20 4c-9-.2-15 3.7-15 11a5 5 0 0 0 5 5c7.3 0 11.2-6 10-16Z" />
      <path d="M5 20c1.7-5.7 5.8-9.9 11.8-12.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  droplet: <path d="M12 2s-7 8.2-7 13a7 7 0 0 0 14 0C19 10.2 12 2 12 2Z" />,
  location: (
    <>
      <path d="M20 10c0 5.3-8 11.6-8 11.6S4 15.3 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3V10Z" />
      <path d="M9 20v-7h6v7" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C9 3 5 3 2.5 4.1V19c3-1 6.8-.8 9.5 1.5 2.7-2.3 6.5-2.5 9.5-1.5V4.1C19 3 15 3 12 5Z" />
      <path d="M12 5v15.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="var(--color-panel)" />
      <circle cx="16" cy="17" r="2" fill="var(--color-panel)" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </>
  ),
  thermometer: (
    <>
      <path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z" />
      <path d="M11 9v9" />
    </>
  ),
  flower: (
    <>
      <path d="M12 12c-3-1-5-6-2-8 2-1.3 4 1 4 4 3-3 6-2 6 1 0 2.5-3 4-6 4 3 2 3 6 0 7-3 1-4-2-3.5-5-3 2-6 .5-6-2 0-3 3.2-4.1 7.5-1Z" />
      <path d="M12 12v10" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  edit: <path d="M13 6 18 11M3 21l4.6-.8L20 7.8a2.7 2.7 0 0 0-3.8-3.8L3.8 16.4 3 21Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
    </>
  ),
  sparkle: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" />,
  humidity: (
    <>
      <path d="M8 3s-4 4.7-4 7.5a4 4 0 0 0 8 0C12 7.7 8 3 8 3Z" />
      <path d="M17 10s-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-3-5.5-3-5.5Z" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
    </>
  ),
  pot: (
    <>
      <path d="M4 10h16l-2 10H6Z" />
      <path d="M12 10V4M12 6c-2-2-5-2-6 0M12 5c2-2 5-2 6 0" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  paw: (
    <>
      <circle cx="6" cy="10" r="2" />
      <circle cx="10" cy="6" r="2" />
      <circle cx="14" cy="6" r="2" />
      <circle cx="18" cy="10" r="2" />
      <path d="M12 12c-3 0-5.5 3.5-5.5 5.5 0 1.7 1.5 2.5 3 2.5 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.5 0 3-.8 3-2.5 0-2-2.5-5.5-5.5-5.5Z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  /** Mirror the icon in right-to-left layouts (for arrows and chevrons). */
  flipRtl?: boolean;
}

export function Icon({ name, flipRtl, className = 'size-5', ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${flipRtl ? 'rtl:-scale-x-100' : ''} ${className}`}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
