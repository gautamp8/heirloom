// Heirloom - logo explorations
// Four marks within the sealed-letter / monogram family. Geometry only:
// circles, type, simple paths. No illustrative drawing.

// 1. Sealed monogram - the primary mark.
//    A wax-toned disc with a serif H pressed into it.
function LogoSeal({ size = 96, mono = false }) {
  const s = size;
  return (
    <img
      src="assets/seal.png"
      width={s} height={s}
      alt="Heirloom seal"
      style={{
        display: 'block', width: s, height: s, objectFit: 'contain',
        filter: mono ? 'grayscale(1) contrast(.95)' : 'none',
        userSelect: 'none', pointerEvents: 'none',
      }}
    />
  );
}

// 2. Embossed initial - a "blind-embossed" H inside a thin ring.
//    Quietest mark; reads as a stamp on paper, not wax.
function LogoEmboss({ size = 96 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-label="Heirloom embossed">
      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="1.1" strokeOpacity=".55"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth=".7" strokeOpacity=".3"/>
      <text x="50" y="50"
            textAnchor="middle" dominantBaseline="central"
            fontFamily="Newsreader, Georgia, serif"
            fontStyle="italic" fontWeight="300"
            fontSize="54"
            fill="currentColor" fillOpacity=".82">H</text>
    </svg>
  );
}

// 3. Wordmark - Heirloom set in transitional italic, with a hair-line
//    rule above. Suited to long-form contexts: emails, exports, footers.
function LogoWordmark({ size = 96 }) {
  // size is height-equivalent; the wordmark is wider than tall.
  const w = size * 3.4;
  const h = size;
  return (
    <svg width={w} height={h} viewBox="0 0 340 100" aria-label="Heirloom wordmark">
      <line x1="14" y1="34" x2="326" y2="34" stroke="currentColor" strokeOpacity=".25" strokeWidth=".9"/>
      <text x="170" y="62"
            textAnchor="middle" dominantBaseline="alphabetic"
            fontFamily="Newsreader, Georgia, serif"
            fontStyle="italic" fontWeight="300"
            letterSpacing=".02em"
            fontSize="54" fill="currentColor">Heirloom</text>
      <text x="170" y="86"
            textAnchor="middle" dominantBaseline="alphabetic"
            fontFamily="JetBrains Mono, ui-monospace, monospace"
            fontSize="9" letterSpacing=".34em"
            fill="currentColor" fillOpacity=".55">PRESERVED · ARCHIVE · MMXXVI</text>
    </svg>
  );
}

// 4. Lockup - seal + wordmark side by side. The "official" pairing.
function LogoLockup({ size = 96 }) {
  const h = size;
  return (
    <div style={{ display:'flex', alignItems:'center', gap: h * 0.22 }}>
      <LogoSeal size={h} />
      <div style={{ display:'flex', flexDirection:'column', gap: h * 0.05, lineHeight: 1 }}>
        <span style={{
          fontFamily:'Newsreader, Georgia, serif',
          fontStyle:'italic', fontWeight: 300,
          fontSize: h * 0.62, letterSpacing:'-.005em', color:'inherit',
        }}>Heirloom</span>
        <span style={{
          fontFamily:'JetBrains Mono, ui-monospace, monospace',
          fontSize: h * 0.10, letterSpacing:'.34em',
          color:'currentColor', opacity:.55, textTransform:'uppercase',
        }}>Preserve presence</span>
      </div>
    </div>
  );
}

// 5. Thread / heirloom - a single sine line tied into a loop, evoking
//    a passed thread. Listed as a "concept" alongside the seal family.
function LogoThread({ size = 96 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-label="Heirloom thread">
      <path d="M14 64
               C 24 64, 28 28, 40 28
               C 52 28, 50 72, 62 72
               C 74 72, 76 36, 86 36"
            fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="14" cy="64" r="2" fill="currentColor"/>
      <circle cx="86" cy="36" r="2" fill="currentColor"/>
    </svg>
  );
}

Object.assign(window, {
  LogoSeal, LogoEmboss, LogoWordmark, LogoLockup, LogoThread,
});
