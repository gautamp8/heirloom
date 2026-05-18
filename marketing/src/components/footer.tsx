import { Seal } from "./seal";
import { links, tryAsNominee } from "./links";

export function Footer() {
  return (
    <footer
      className="mt-[var(--spacing-cinema)] border-t pt-14 pb-12"
      style={{ borderColor: "var(--color-rule-soft)" }}
    >
      <div className="mx-auto max-w-[1180px] px-5 grid md:grid-cols-[1.4fr_1fr] gap-12">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <Seal size={26} />
            <span
              className="font-serif"
              style={{ fontSize: 18, color: "var(--color-ink)" }}
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
          </div>
          <p className="p-body" style={{ maxWidth: "36ch", fontSize: 14 }}>
            <span className="voice">Preserve presence across generations.</span>{" "}
            A private archive for the people you love.
          </p>
        </div>

        <div>
          <p className="eyebrow mb-4">Explore</p>
          <ul className="flex flex-col gap-2.5">
            <FooterLink href={tryAsNominee()} external>
              Try the Sagan archive
            </FooterLink>
            <FooterLink href={links.releases} external>
              Download for macOS
            </FooterLink>
            <FooterLink href="/design">Design and ethics</FooterLink>
            <FooterLink href="/transparency">The grounding contract</FooterLink>
            <FooterLink href={links.github} external>
              Source on GitHub
            </FooterLink>
          </ul>
        </div>
      </div>

      <div
        className="mx-auto max-w-[1180px] px-5 mt-12 pt-6"
        style={{ borderTop: "1px solid var(--color-rule-soft)" }}
      >
        <p className="p-meta">© 2026 Gautam Prajapati</p>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="transition-colors"
        style={{
          color: "var(--color-ink-soft)",
          textDecoration: "none",
          fontSize: 14,
          fontFamily: "var(--font-sans)",
        }}
      >
        {children}
      </a>
    </li>
  );
}
