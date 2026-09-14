/* Inline icon set for the chat surface.
 * Stroke-based, 1.6 units, currentColor — so every icon inherits the state
 * colour of whatever control it sits in without a second variant.
 */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Svg = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base} {...rest}>
    {children}
  </svg>
);

export const IconPlus = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconChevron = (p) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);

export const IconSend = (p) => (
  <Svg {...p}><path d="M5 12.5 19.5 5l-4.2 14.6-3.1-5.9-5.2-1.2Z" /></Svg>
);

export const IconStop = (p) => (
  <Svg {...p}><rect x="7" y="7" width="10" height="10" rx="2.2" /></Svg>
);

export const IconVoice = (p) => (
  <Svg {...p}>
    <path d="M5 10v4M9 7v10M13 9v6M17 11v2M21 10v4" />
  </Svg>
);

export const IconHome = (p) => (
  <Svg {...p}><path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" /></Svg>
);

export const IconBolt = (p) => (
  <Svg {...p}><path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5Z" /></Svg>
);

export const IconScale = (p) => (
  <Svg {...p}><path d="M12 4v16M5 8h14M4 16l3-6 3 6a3 3 0 0 1-6 0Zm10 0 3-6 3 6a3 3 0 0 1-6 0Z" /></Svg>
);

export const IconBulb = (p) => (
  <Svg {...p}><path d="M9 18h6M10 21h4M8 11a4 4 0 1 1 8 0c0 1.7-1 2.6-1.5 3.6-.3.6-.5 1-.5 1.4h-4c0-.4-.2-.8-.5-1.4C9 13.6 8 12.7 8 11Z" /></Svg>
);

export const IconFlask = (p) => (
  <Svg {...p}><path d="M10 3h4M11 3v6L5.5 18A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3L13 9V3M7.8 15h8.4" /></Svg>
);

export const IconCompass = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m15 9-2 4.2-4 1.8 2-4.2Z" /></Svg>
);

export const IconChart = (p) => (
  <Svg {...p}><path d="M4 20h16M7 20v-6M12 20V7M17 20v-9" /></Svg>
);

export const IconGrid = (p) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" />
  </Svg>
);

export const IconPulse = (p) => (
  <Svg {...p}><path d="M3 12h4l2.5-6 4 13L16 12h5" /></Svg>
);

export const IconSpark = (p) => (
  <Svg {...p}><path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.8L12 18l-1.7-5.5L5 10.7 10.3 9Z" /><path d="M18.5 4v3M20 5.5h-3" /></Svg>
);

export const IconMail = (p) => (
  <Svg {...p}><rect x="3" y="5.5" width="18" height="13" rx="2.4" /><path d="m4 8 8 5 8-5" /></Svg>
);

export const IconCopy = (p) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2.2" /><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" /></Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Svg>
);

export const IconRefresh = (p) => (
  <Svg {...p}><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" /></Svg>
);

export const IconArrowDown = (p) => (
  <Svg {...p}><path d="M12 5v14m0 0-5.5-5.5M12 19l5.5-5.5" /></Svg>
);

export const IconExternal = (p) => (
  <Svg {...p}><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
);

export const IconNew = (p) => (
  <Svg {...p}><path d="M5 19.5 19 5.5M9 4.5v3M7.5 6h3M17 15v2.5M15.8 16.2h2.5" /><path d="M12.5 7.5 16 11" /></Svg>
);

