/**
 * One vector icon set for the HUD and the mission surfaces (products of IMPL-0037). 24×24, stroke 2, round caps:
 * the glyphs inherit the text colour, carry no accessible name (`aria-hidden`) and are never emoji. Adding a
 * name means adding one path set here and using it through `name`, so the whole interface keeps one optical weight.
 */
import type { ReactNode } from "react";

export type IconName =
  | "village"
  | "play"
  | "gift"
  | "users"
  | "chart"
  | "menu"
  | "star"
  | "target"
  | "user"
  | "shield"
  | "clock"
  | "sky"
  | "speech"
  | "book"
  | "map"
  | "bag"
  | "check"
  | "arrow"
  | "in-progress"
  | "lock"
  | "hourglass"
  | "compass"
  | "snow"
  | "sun"
  | "rain"
  | "fog"
  | "wind";

const GLYPHS: Record<IconName, ReactNode> = {
  village: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  play: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" />
    </>
  ),
  gift: (
    <>
      <path d="M3 8h18v4H3z" />
      <path d="M5 12v8h14v-8M12 8v12" />
      <path d="M12 8C9.5 8 7 6.6 7 5s3.5-2 5 3c1.5-5 5-4.6 5-3s-2.5 3-5 3z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M18 14.5c2 .8 3 2.5 3 5.5" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20v-6M12 20V8M19 20v-10" />
      <path d="M3 20h18" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9L12 3z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6l-7-3z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  sky: (
    <>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
      <path d="M17 3v2M21 6h-2" />
    </>
  ),
  speech: <path d="M4 5h16v11H9l-5 4V5z" />,
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  "in-progress": (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3v3.5L12 12l5-5.5V3M7 21v-3.5L12 12l5 5.5V21" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 6-4 2 2-6 4-2z" />
    </>
  ),
  snow: <path d="M12 2v20M4 6l16 12M20 6 4 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1A3.5 3.5 0 0 1 17 15H7z" />
      <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
    </>
  ),
  fog: <path d="M4 9h16M3 13h18M5 17h14" />,
  wind: (
    <>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h15a3 3 0 1 1-3 3" />
      <path d="M3 16h7" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
