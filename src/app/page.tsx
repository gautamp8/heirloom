export default function Home() {
  return (
    <main className="relative min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden
        className="h-16 w-16 rounded-full mb-10"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, var(--color-wax-soft), var(--color-wax) 55%, color-mix(in oklab, var(--color-wax) 70%, black) 100%)",
          boxShadow: "var(--shadow-paper-2)",
        }}
      />

      <h1
        className="font-serif font-light"
        style={{
          fontSize: "var(--t-display)",
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
        }}
      >
        Heirloom
      </h1>

      <p
        className="voice mt-4 max-w-xl"
        style={{ fontSize: "var(--t-h3)", lineHeight: 1.4 }}
      >
        Preserve presence across generations.
      </p>

      <div className="mt-16 flex flex-col items-center gap-3">
        <button
          className="rounded-full px-7 py-3 text-[15px] transition-colors"
          style={{
            background: "var(--color-wax)",
            color: "var(--color-bone)",
            transitionDuration: "var(--duration-quick)",
            transitionTimingFunction: "var(--ease-paper)",
          }}
        >
          Begin a new archive
        </button>
        <a
          href="#"
          className="text-sm underline-offset-4 hover:underline"
          style={{ color: "var(--color-ink-mute)" }}
        >
          I have a sealed letter
        </a>
      </div>

      <p className="meta absolute bottom-8">
        Local-first · Nothing leaves this device.
      </p>
    </main>
  );
}
