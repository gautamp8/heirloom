// Sealed letter: a folded paper with a wax seal pressed into it.
// SVG drawn from scratch - no asset dependency.

export function MockupLetter({ width = 360 }: { width?: number }) {
  const h = (width * 230) / 360;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        viewBox="0 0 360 230"
        width={width}
        height={h}
        role="img"
        aria-label="A folded letter sealed with red wax"
      >
        <defs>
          <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FBF7EE" />
            <stop offset="1" stopColor="#EBE2CB" />
          </linearGradient>
          <radialGradient id="wax" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#A23F2A" />
            <stop offset="0.55" stopColor="#7D2A1A" />
            <stop offset="1" stopColor="#5C1F12" />
          </radialGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dy="4" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.18" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* envelope back */}
        <rect
          x="20"
          y="40"
          width="320"
          height="170"
          rx="6"
          fill="url(#paper)"
          stroke="rgba(31,27,20,0.10)"
          filter="url(#shadow)"
        />

        {/* triangular flap */}
        <path
          d="M20 40 L180 140 L340 40 Z"
          fill="url(#paper)"
          stroke="rgba(31,27,20,0.14)"
        />

        {/* fold creases */}
        <line x1="20" y1="40" x2="180" y2="140" stroke="rgba(31,27,20,0.06)" />
        <line x1="340" y1="40" x2="180" y2="140" stroke="rgba(31,27,20,0.06)" />

        {/* wax blob */}
        <g transform="translate(180 142)">
          <ellipse cx="0" cy="0" rx="32" ry="30" fill="url(#wax)" />
          {/* drips */}
          <path
            d="M-22 18 Q-26 28 -22 34 Q-18 28 -18 22 Z"
            fill="#5C1F12"
            opacity="0.85"
          />
          <path
            d="M22 18 Q26 28 22 34 Q18 28 18 22 Z"
            fill="#5C1F12"
            opacity="0.85"
          />
          {/* embossed H */}
          <text
            x="0"
            y="6"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fontWeight="400"
            fontSize="28"
            fill="#3a1208"
            opacity="0.55"
          >
            H
          </text>
          <text
            x="0"
            y="4.5"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fontWeight="400"
            fontSize="28"
            fill="#F2ECDD"
            opacity="0.25"
          >
            H
          </text>
        </g>

        {/* inscription */}
        <text
          x="180"
          y="200"
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontSize="13"
          fill="#5C3A21"
        >
          For when you feel insignificant.
        </text>
      </svg>
    </div>
  );
}
