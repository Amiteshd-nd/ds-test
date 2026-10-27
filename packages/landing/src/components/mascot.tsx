/**
 * The little house on a skateboard at the top of the card. Same hand as the
 * stickers in public/pattern.svg: thick outline, white fill, a small face.
 */
export function Mascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 100"
      aria-hidden
      className={className}
      fill="#fff"
      stroke="#141414"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* speed lines */}
      <path d="M8 60 H22 M4 70 H18" fill="none" />
      {/* skateboard */}
      <path d="M34 82 Q40 88 48 88 H104 Q112 88 118 82" fill="none" />
      <circle cx="52" cy="92" r="5" fill="#141414" />
      <circle cx="100" cy="92" r="5" fill="#141414" />
      {/* house */}
      <path d="M46 40 L76 14 L106 40 V80 H46 Z" />
      <path d="M46 40 H106" fill="none" />
      <path d="M92 20 h8 v10" />
      <rect x="69" y="60" width="14" height="20" rx="3" />
      {/* face */}
      <circle cx="66" cy="34" r="3.4" fill="#141414" stroke="none" />
      <circle cx="86" cy="34" r="3.4" fill="#141414" stroke="none" />
      <path d="M70 42 Q76 47 82 42" fill="none" />
      {/* a rolled drawing under one arm */}
      <rect x="104" y="52" width="26" height="12" rx="6" transform="rotate(-20 117 58)" />
    </svg>
  );
}
