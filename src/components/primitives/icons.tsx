/* Inline stroke icons at the same weight as the lifted components
 * (24-box, round caps, 2-ish stroke). Stands in for the private
 * @central-icons-react set the library imported. */

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Svg({
  size = 18,
  className,
  strokeWidth = 2,
  fill = "none",
  children,
}: IconProps & { fill?: string; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9.1 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9.1a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1z" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconCross = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.5}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);

export const IconSidebar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9 4v16" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);

export const IconStop = (p: IconProps) => (
  <Svg {...p} fill="currentColor" strokeWidth={0}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </Svg>
);

export const IconRetry = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p} fill="currentColor" strokeWidth={0}>
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
  </Svg>
);

export const IconTerminal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 17l6-5-6-5M12 19h8" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Svg>
);

export const IconWrench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.8 2.8 0 0 1-4-4z" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h18v3H3zM5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9M10 14h4" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const IconPaperclip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.4 11.6 12 20a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.9-7.8" />
  </Svg>
);

export const IconDatabase = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.75v.5" />
  </Svg>
);

export const IconPlug = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const IconMessage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-3.8-.8L3 21l1.8-5A8.4 8.4 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" />
  </Svg>
);

export const IconBranch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="9" r="2.5" />
    <path d="M6 7.5v9M8.5 8.5H14a1.5 1.5 0 0 1 1.5 1.5v.5" />
  </Svg>
);

export const IconAt = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </Svg>
);

export const IconSlash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4L9 20" />
  </Svg>
);

export const IconBulb = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6l.1.5h5l.1-.5c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z" />
  </Svg>
);

export const IconAgent = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 4v4M9 13v1.5M15 13v1.5" />
  </Svg>
);

export const IconChip = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
  </Svg>
);

export const IconQuestion = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.2 9a3 3 0 1 1 4 2.8c-.8.3-1.2 1-1.2 1.8v.4" />
    <path d="M12 17.5v.5" strokeWidth={p.strokeWidth ?? 2.6} />
  </Svg>
);
