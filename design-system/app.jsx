// Heirloom Design System - page body + live previews + Tweaks.
// Static content is rendered into the page below; the React tree only owns
// the parts that need to react to tweaks (logo selection, mode-switch demo,
// handoff preview, palette/type swap on :root) plus the Tweaks panel itself.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "warm",
  "type": "source-geist",
  "logoVariant": "seal",
  "mode": "page-turn",
  "handoff": "wax-seal",
  "motion": "restrained",
  "viewMode": "creator"
}/*EDITMODE-END*/;

const PALETTES = {
  warm:   ['#FAF7F0', '#E8DFC8', '#7D2A1A', '#1F1B14'],
  cool:   ['#F5F6F7', '#DCE0E4', '#1F3553', '#10141A'],
  garden: ['#F4F1EA', '#D6D2BE', '#7A3A3C', '#1B1F18'],
  mono:   ['#F7F6F4', '#E1E0DC', '#7B2A1A', '#111110'],
};

// Page-turn mode-switch - clicking the stage flips the page.
function ModeStage({ metaphor }) {
  const [on, setOn] = React.useState(false);
  if (metaphor === 'page-turn') {
    return (
      <div className="mode-stage" data-on={on ? '1' : '0'}
           onClick={() => setOn(v => !v)} role="button" aria-label="Toggle mode">
        <div className="layer-bottom">
          <span style={{ padding: 24 }}>View · the archive opens</span>
        </div>
        <div className="mode-page">
          <div className="face front" style={{ background:'var(--bg-raised)' }}>
            <div className="meta">Creator</div>
            <div style={{
              fontFamily:'var(--serif)', fontSize: 28, fontWeight: 300,
              fontStyle:'italic', color:'var(--ink-soft)', lineHeight: 1.2,
            }}>Today, what would you like to leave behind?</div>
            <div className="meta">Tap to turn the page</div>
          </div>
          <div className="face back">
            <div className="meta">View</div>
            <div style={{ fontFamily:'var(--serif)', fontSize: 22, fontStyle:'italic', color:'var(--ink-soft)' }}>
              A held space. Nothing here asks anything of you.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (metaphor === 'rooms') {
    return (
      <div className="mode-stage" onClick={() => setOn(v => !v)} role="button">
        <div style={{
          position:'absolute', inset: 0, background: on ? 'var(--parchment)' : 'var(--bg-raised)',
          transition:'background 900ms var(--ease-paper)',
          display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding: 24,
        }}>
          <div style={{
            fontFamily:'var(--serif)', fontStyle:'italic', fontSize: 24, fontWeight: 300,
            color:'var(--ink-soft)',
          }}>{on ? 'View - the lights are lowered' : 'Creator - the workroom'}</div>
        </div>
        <div style={{
          position:'absolute', inset: 0, pointerEvents:'none',
          background:'radial-gradient(circle at 50% 70%, transparent 0 25%, rgba(0,0,0,.18) 100%)',
          opacity: on ? 1 : 0, transition:'opacity 900ms var(--ease-paper)',
        }}/>
      </div>
    );
  }
  if (metaphor === 'lantern') {
    return (
      <div className="mode-stage" onClick={() => setOn(v => !v)} role="button"
           style={{ background:'#1F1B14' }}>
        <div style={{
          position:'absolute', inset: 0,
          background:`radial-gradient(circle at 50% 50%, rgba(201,137,42,${on ? .35 : .08}) 0, transparent 55%)`,
          transition:'background 1100ms var(--ease-paper)',
        }}/>
        <div style={{
          position:'absolute', inset: 0, display:'flex', alignItems:'center', justifyContent:'center',
          color: on ? '#F4E1B5' : 'rgba(244,225,181,.4)',
          fontFamily:'var(--serif)', fontStyle:'italic', fontWeight: 300, fontSize: 24,
          transition:'color 1100ms var(--ease-paper)', textAlign:'center', padding: 24,
        }}>{on ? 'Uncovered.' : 'A covered lantern.'}</div>
      </div>
    );
  }
  return (
    <div className="mode-stage" onClick={() => setOn(v => !v)} role="button">
      <div style={{
        position:'absolute', inset: 0,
        transform: on ? 'translateY(0)' : 'translateY(-100%)',
        transition:'transform 900ms var(--ease-fold)',
        background:'var(--ivory)', display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--serif)', fontStyle:'italic', color:'var(--ink-soft)',
      }}>View - drawer open</div>
      <div style={{
        position:'absolute', inset: 0, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--serif)', fontStyle:'italic', color:'var(--fg-mute)',
      }}>Creator</div>
    </div>
  );
}

function HandoffPreview({ variant }) {
  if (variant === 'wax-seal') {
    return (
      <div style={{ position:'relative', width: '100%', maxWidth: 420 }}>
        <div className="envelope">
          <div className="addr">
            <small>For</small>
            Maren, on her eighteenth birthday
          </div>
          <div className="stamp-seal"><div className="wax-seal">H</div></div>
        </div>
      </div>
    );
  }
  if (variant === 'unfold') {
    return (
      <div style={{
        width: 240, height: 180, background:'var(--bg-raised)',
        border:'1px solid var(--rule)', borderRadius: 4, position:'relative',
        backgroundImage:'linear-gradient(135deg, transparent 49.5%, var(--rule-soft) 50%, transparent 50.5%)',
        backgroundSize: '60% 60%', backgroundRepeat:'no-repeat', backgroundPosition:'center',
        display:'flex', alignItems:'flex-end', padding: 18,
        boxShadow:'var(--paper-2)',
      }}>
        <span className="meta">Folded once · ready to open</span>
      </div>
    );
  }
  if (variant === 'threshold') {
    return (
      <div style={{
        width: 240, height: 220, background:'var(--parchment)',
        borderRadius: '120px 120px 0 0',
        border:'1px solid var(--rule)', borderBottom: 0,
        display:'flex', alignItems:'flex-end', justifyContent:'center', padding: 24,
        position:'relative', overflow:'hidden',
      }}>
        <div style={{
          position:'absolute', left:'50%', top: 40, transform:'translateX(-50%)',
          width: 90, height: 160, background:'var(--bg-raised)', borderRadius:'45px 45px 0 0',
          border:'1px solid var(--rule)', borderBottom: 0,
        }}/>
        <span className="meta" style={{ position:'relative', zIndex: 1 }}>A doorway, held open</span>
      </div>
    );
  }
  return (
    <div style={{
      width: 220, height: 220, borderRadius:'50%', background:'#1F1B14',
      position:'relative', display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        position:'absolute', inset: 0, borderRadius:'50%',
        background:'radial-gradient(circle at 50% 45%, rgba(201,137,42,.55), transparent 55%)',
      }}/>
      <span style={{
        position:'relative', zIndex: 1, color:'#F4E1B5',
        fontFamily:'var(--serif)', fontStyle:'italic', fontSize: 22, fontWeight: 300,
      }}>Lantern uncovered</span>
    </div>
  );
}

function LogoForVariant({ variant, size = 110, mono = false }) {
  switch (variant) {
    case 'seal':    return <LogoSeal size={size} mono={mono}/>;
    case 'emboss':  return <LogoEmboss size={size}/>;
    case 'wordmark':return <LogoWordmark size={size * 0.55}/>;
    case 'lockup':  return <LogoLockup size={size * 0.82}/>;
    case 'thread':  return <LogoThread size={size}/>;
    default:        return <LogoSeal size={size}/>;
  }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.documentElement.dataset.palette = t.palette;
    document.documentElement.dataset.type = t.type;
    document.documentElement.dataset.viewmode = t.viewMode;
  }, [t.palette, t.type, t.viewMode]);

  return (
    <>
      {/* Live demos mounted by id into the static page */}
      <LiveCoverSeal variant={t.logoVariant} />
      <LiveLogoGallery variant={t.logoVariant} />
      <LiveModeStage metaphor={t.mode} />
      <LiveHandoff variant={t.handoff} />

      <TweaksPanel title="Heirloom - Tweaks">
        <TweakSection label="Palette">
          <TweakColor label="Temperature" value={t.palette === 'warm' ? PALETTES.warm : PALETTES[t.palette]}
            options={[PALETTES.warm, PALETTES.cool, PALETTES.garden, PALETTES.mono]}
            onChange={(arr) => {
              const k = Object.entries(PALETTES).find(([, v]) => v.join() === arr.join())?.[0] || 'warm';
              setTweak('palette', k);
            }}/>
        </TweakSection>

        <TweakSection label="Typography">
          <TweakSelect label="Pairing" value={t.type}
            options={[
              { value:'newsreader-geist', label:'Newsreader · Geist' },
              { value:'garamond-geist',   label:'EB Garamond · Geist' },
              { value:'source-geist',     label:'Source Serif · Geist' },
              { value:'newsreader-only',  label:'Newsreader (mono pair)' },
            ]}
            onChange={(v) => setTweak('type', v)}/>
        </TweakSection>

        <TweakSection label="Brand mark">
          <TweakSelect label="Logo variant" value={t.logoVariant}
            options={[
              { value:'seal',     label:'Seal - wax monogram' },
              { value:'emboss',   label:'Emboss - blind stamp' },
              { value:'wordmark', label:'Wordmark - italic' },
              { value:'lockup',   label:'Lockup - mark + word' },
              { value:'thread',   label:'Thread - alternate' },
            ]}
            onChange={(v) => setTweak('logoVariant', v)}/>
        </TweakSection>

        <TweakSection label="Motion">
          <TweakSelect label="Mode switch" value={t.mode}
            options={[
              { value:'page-turn', label:'Turning a page' },
              { value:'rooms',     label:'Changing rooms' },
              { value:'lantern',   label:'Lowering the lights' },
              { value:'drawer',    label:'Opening a drawer' },
            ]}
            onChange={(v) => setTweak('mode', v)}/>
          <TweakSelect label="Handoff" value={t.handoff}
            options={[
              { value:'wax-seal',  label:'Wax seal + envelope' },
              { value:'unfold',    label:'Folded paper' },
              { value:'threshold', label:'Threshold' },
              { value:'lantern',   label:'Uncovered lantern' },
            ]}
            onChange={(v) => setTweak('handoff', v)}/>
          <TweakRadio label="Intensity" value={t.motion}
            options={['barely','restrained','cinema']}
            onChange={(v) => setTweak('motion', v)}/>
        </TweakSection>

        <TweakSection label="Demo mode">
          <TweakRadio label="View as" value={t.viewMode}
            options={['creator','nominee']}
            onChange={(v) => setTweak('viewMode', v)}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// Portal-style mounts - each picks up a placeholder div in the static page
// and renders into it. Lets us keep the page mostly as authored HTML.
function LiveCoverSeal({ variant }) {
  const host = document.getElementById('cover-seal');
  if (!host) return null;
  return ReactDOM.createPortal(<LogoForVariant variant={variant} size={64} mono />, host);
}
function LiveLogoGallery({ variant }) {
  const host = document.getElementById('logo-primary');
  if (!host) return null;
  return ReactDOM.createPortal(<LogoForVariant variant={variant} size={150} />, host);
}
function LiveModeStage({ metaphor }) {
  const host = document.getElementById('mode-stage');
  if (!host) return null;
  return ReactDOM.createPortal(<ModeStage metaphor={metaphor} />, host);
}
function LiveHandoff({ variant }) {
  const host = document.getElementById('handoff-preview');
  if (!host) return null;
  return ReactDOM.createPortal(<HandoffPreview variant={variant} />, host);
}

// Render after DOMContentLoaded so the portal hosts exist.
function mount() {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
