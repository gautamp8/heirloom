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

        {/* The real pressed-wax seal, the same asset the app and the hero
            envelope use. This was previously drawn from scratch - an
            ellipse with two "drip" paths and a Georgia-italic H - which
            read as a flat disc with legs stuck under it and matched
            nothing else on the site. */}
        <image
          href="/seal-2x.png"
          x="145"
          y="107"
          width="70"
          height="70"
          preserveAspectRatio="xMidYMid meet"
        />

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
