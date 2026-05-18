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
        aria-label="Download Heirloom for macOS"
        style={{
          background: "#FFFDF7",
          borderRadius: 16,
          padding: 28,
          maxWidth: 560,
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
          {links.releaseTag} is the first release candidate. It isn't
          notarized yet.
        </h3>

        <p className="p-body mt-4" style={{ fontSize: 14.5, lineHeight: 1.55 }}>
          When you open the downloaded <code className="font-mono">.dmg</code>,
          macOS will warn that the developer cannot be verified. Right-click
          the app in Applications and choose{" "}
          <em className="italic">Open</em> the first time to bypass. Apple
          notarization is on the way.
        </p>

        <ol
          className="mt-4 flex flex-col gap-2"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--color-ink-soft)",
            paddingLeft: 18,
          }}
        >
          <li>
            One-time prep: pull the two models with Ollama. ~10 minutes on a
            decent connection.
            <pre
              style={{
                marginTop: 6,
                padding: "8px 12px",
                background: "var(--color-paper-3)",
                border: "1px solid var(--color-rule)",
                borderRadius: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--color-ink)",
                whiteSpace: "pre",
              }}
            >
{`ollama pull gemma4:e4b
ollama pull embeddinggemma`}
            </pre>
          </li>
          <li>Download the disk image.</li>
          <li>Open it, drag Heirloom into Applications.</li>
          <li>
            In Applications, right-click <strong>Heirloom</strong> and choose{" "}
            <em className="italic">Open</em>. Confirm the second prompt.
          </li>
        </ol>
        <p
          className="p-meta mt-3"
          style={{ color: "var(--color-ink-fade)", fontSize: 11.5 }}
        >
          This RC requires the manual pull step above. Auto-pull with a
          progress UI lands in the next release candidate.
        </p>

        <hr
          style={{
            margin: "22px 0 14px",
            border: 0,
            borderTop: "1px solid var(--color-rule-soft)",
          }}
        />

        <p className="p-meta">Verify the download</p>
        <p
          className="p-body mt-2"
          style={{ fontSize: 13, color: "var(--color-ink-soft)" }}
        >
          Compare against{" "}
          <a
            href={links.dmgSha256}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--color-ink)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Heirloom.dmg.sha256
          </a>
          :
        </p>
        <pre
          style={{
            marginTop: 8,
            padding: "10px 14px",
            background: "var(--color-paper-3)",
            border: "1px solid var(--color-rule)",
            borderRadius: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            lineHeight: 1.5,
            overflow: "auto",
            color: "var(--color-ink)",
            whiteSpace: "pre",
          }}
        >
          shasum -a 256 Heirloom.dmg
        </pre>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <a
            href={links.dmgDownload}
            className="btn btn-wax"
            style={{ fontSize: 13.5 }}
          >
            <IconApple size={14} />
            Download Heirloom {links.releaseTag}
          </a>
          <a
            href={links.releasePage}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: 13.5 }}
          >
            Release notes
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
