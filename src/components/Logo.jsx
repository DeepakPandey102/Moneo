import React, { useId } from "react";

// Moneo mark: a rounded lowercase "m" in the blue → violet gradient,
// followed by the lowercase "moneo" wordmark.
export function LogoMark({ size = 30 }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 40 32" aria-hidden="true">
      <defs>
        <linearGradient id={`lm${id}`} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#5B6CFF" />
          <stop offset="0.55" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#B26BFF" />
        </linearGradient>
      </defs>
      <path
        d="M5 28V13.5a8.5 8.5 0 0 1 15 0V28M20 13.5a8.5 8.5 0 0 1 15 0V28"
        fill="none"
        stroke={`url(#lm${id})`}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ size = 30, withText = true, textSize = 22 }) {
  return (
    <span className="mo-logo" style={{ fontSize: textSize }}>
      <LogoMark size={size * 1.15} />
      {withText && <span className="mo-logo-text">moneo</span>}
    </span>
  );
}
