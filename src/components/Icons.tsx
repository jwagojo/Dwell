import type { ReactNode, SVGProps } from 'react';

// Inline stroke SVGs only: 2.2px stroke, round caps, currentColor, decorative (aria-hidden).
type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

function Svg({ size = 18, children, filled = false, ...rest }: IconProps & { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Bolt = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M13.5 2 4.5 13.5H11L10 22l9-11.5h-6.5L13.5 2z" />
  </Svg>
);
export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.6-4.6" />
  </Svg>
);
export const Walk = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="m9.5 21 2.7-6.5L15 17v4" />
    <path d="m7 12 3.3-3.7 3.4 1.2 1.8 3 3 1" />
  </Svg>
);
export const Sun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </Svg>
);
export const Plug = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2.5v5M15 2.5v5M6 7.5h12V11a6 6 0 0 1-12 0V7.5zM12 17v4.5" />
  </Svg>
);
export const Warn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Svg>
);
export const Info = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
export const Camera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8h3.2L8.5 5h7l1.8 3h3.2v11h-17V8z" />
    <circle cx="12" cy="13.2" r="3.5" />
  </Svg>
);
export const Pin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21.5s7-6.2 7-11.8a7 7 0 0 0-14 0c0 5.6 7 11.8 7 11.8z" />
    <circle cx="12" cy="9.7" r="2.4" />
  </Svg>
);
export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const House = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 11 9-8 9 8" />
    <path d="M5.5 9.5V20h13V9.5" />
  </Svg>
);
