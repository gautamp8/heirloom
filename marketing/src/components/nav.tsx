"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Seal } from "./seal";
import { IconGithub, IconDownload, IconExternal } from "./icons";
import { links, tryAsNominee } from "./links";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-20 transition-colors"
      style={{
        background: scrolled ? "rgba(250, 247, 240, 0.92)" : "transparent",
        backdropFilter: scrolled ? "saturate(180%) blur(10px)" : undefined,
        WebkitBackdropFilter: scrolled ? "saturate(180%) blur(10px)" : undefined,
        borderBottom: scrolled ? "1px solid var(--color-rule-soft)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto max-w-[1180px] px-5 h-[60px] flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Heirloom home"
        >
          <Seal size={26} />
          <span
            className="font-serif"
            style={{
              fontSize: 18,
              fontWeight: 400,
              letterSpacing: "-0.005em",
              color: "var(--color-ink)",
            }}
          >
            Heirloom
            <sup
              style={{
                marginLeft: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--color-candle)",
                top: "-0.6em",
                position: "relative",
              }}
            >
              Beta
            </sup>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/design">Design</NavLink>
          <NavLink href="/transparency">Transparency</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={tryAsNominee()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary btn"
            style={{ padding: "9px 16px", fontSize: 13.5 }}
          >
            Try the archive
            <IconExternal size={14} />
          </a>
          <a
            href={links.releases}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-wax hidden sm:inline-flex"
            style={{ padding: "9px 16px", fontSize: 13.5 }}
          >
            <IconDownload size={14} />
            Download
          </a>
          <a
            href={links.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="text-ink-soft hover:text-ink transition-colors p-2 -mr-2"
          >
            <IconGithub size={20} />
          </a>
        </div>
      </div>

      {/* mobile nav row */}
      <nav
        className="md:hidden flex items-center justify-center gap-5 pb-2 -mt-1"
        aria-label="Primary mobile"
      >
        <NavLink href="/" small>Home</NavLink>
        <NavLink href="/design" small>Design</NavLink>
        <NavLink href="/transparency" small>Transparency</NavLink>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
  small,
}: {
  href: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-full transition-colors"
      style={{
        color: "var(--color-ink-soft)",
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        fontSize: small ? 13 : 14,
      }}
    >
      {children}
    </Link>
  );
}
