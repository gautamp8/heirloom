"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconApple, IconClose, IconExternal } from "./icons";
import { links } from "./links";

export function DownloadButton({
  size = "default",
  variant = "wax",
}: {
  size?: "default" | "large";
  variant?: "wax" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  const padX = size === "large" ? 26 : 22;
  const padY = size === "large" ? 14 : 12;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "wax" ? "btn btn-wax" : "btn btn-secondary"}
        style={{
          padding: `${padY}px ${padX}px`,
          fontSize: size === "large" ? 15 : 14,
        }}
      >
        <IconApple size={size === "large" ? 16 : 14} />
        Download for macOS
      </button>

      {open && <DownloadModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DownloadModal({ onClose }: { onClose: () => void }) {
  // The hero section wraps its children in a stacking context
  // (`.stage { isolation: isolate }`) plus `z-10` on the inner div,
  // so a fixed modal rendered inline gets trapped underneath the
  // page sections that follow. Portal to the body to escape that.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 27, 20, 0.48)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        zIndex: 2147483646,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="About the macOS download"
        style={{
          background: "#FFFDF7",
          borderRadius: 16,
          padding: 28,
          maxWidth: 540,
          width: "100%",
          boxShadow:
            "0 2px 0 rgba(0, 0, 0, 0.06), 0 30px 60px -20px rgba(31, 27, 20, 0.30)",
          border: "1px solid rgba(31, 27, 20, 0.10)",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--color-ink-muted)",
            padding: 0,
            display: "inline-flex",
          }}
        >
          <IconClose size={16} />
        </button>

        <p className="p-meta">A note before you download</p>
        <h3 className="h-title mt-2" style={{ fontSize: 22, lineHeight: 1.25 }}>
          The first signed build is still on the way.
        </h3>

        <p className="p-body mt-4" style={{ fontSize: 14.5, lineHeight: 1.55 }}>
          We're preparing the first notarized release. Until that lands, two
          paths work today:
        </p>

        <ul
          className="mt-4 flex flex-col gap-3"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--color-ink-soft)",
          }}
        >
          <li>
            <strong style={{ color: "var(--color-ink)", fontWeight: 500 }}>
              Watch the repository
            </strong>{" "}
            — when the first <code className="font-mono">.dmg</code> ships,
            it'll be listed under Releases on GitHub.
          </li>
          <li>
            <strong style={{ color: "var(--color-ink)", fontWeight: 500 }}>
              Build it yourself
            </strong>{" "}
            — clone the repo and run the bundle script. Apple Silicon
            recommended.
          </li>
        </ul>

        <hr
          style={{
            margin: "22px 0 14px",
            border: 0,
            borderTop: "1px solid var(--color-rule-soft)",
          }}
        />

        <p className="p-meta">Build it yourself</p>
        <pre
          style={{
            marginTop: 8,
            padding: "14px 16px",
            background: "var(--color-paper-3)",
            border: "1px solid var(--color-rule)",
            borderRadius: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            lineHeight: 1.55,
            overflow: "auto",
            color: "var(--color-ink)",
            whiteSpace: "pre",
          }}
        >
{`git clone https://github.com/gautamp8/heirloom
cd heirloom
pnpm install
bash desktop/scripts/package.sh
# → desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg`}
        </pre>

        <p
          className="p-body mt-4"
          style={{ fontSize: 13, color: "var(--color-ink-soft)" }}
        >
          When you open the resulting <code className="font-mono">.dmg</code>,
          macOS will say it cannot verify the developer. Right-click the app
          and choose <em className="italic">Open</em> the first time to
          bypass. Notarization is on the way.
        </p>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <a
            href={links.releases}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-wax"
            style={{ fontSize: 13.5 }}
          >
            Watch releases on GitHub
            <IconExternal size={13} />
          </a>
          <a
            href={links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: 13.5 }}
          >
            Read the source
            <IconExternal size={13} />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
