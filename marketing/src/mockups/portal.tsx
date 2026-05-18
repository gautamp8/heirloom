// The portal screen, as rendered in the live app: wax seal,
// the italic wordmark, three doors. No data, no state.
import Image from "next/image";

export function MockupPortal() {
  return (
    <div
      className="stage"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "44px 28px 28px",
        position: "relative",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          position: "relative",
          zIndex: 10,
        }}
      >
        <Image
          src="/seal-2x.png"
          alt=""
          width={112}
          height={112}
          aria-hidden
          style={{ width: 112, height: 112 }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            textAlign: "center",
          }}
        >
          <h1 className="h-display" style={{ fontSize: 44 }}>
            <em>Heirloom</em>
          </h1>
          <p className="p-body" style={{ maxWidth: 260, fontSize: 14 }}>
            Preserve presence across generations.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          position: "relative",
          zIndex: 10,
        }}
      >
        <DoorBtn label="Begin a new archive" primary />
        <DoorBtn label="I have a passphrase" />
        <DoorBtn label="Import an existing archive" />
      </div>
    </div>
  );
}

function DoorBtn({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <div
      style={{
        height: 52,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        fontSize: 14.5,
        letterSpacing: 0.01,
        background: primary ? "var(--color-ink)" : "transparent",
        color: primary ? "var(--color-paper)" : "var(--color-ink)",
        border: primary
          ? "1px solid var(--color-ink)"
          : "1px solid var(--color-rule)",
      }}
    >
      {label}
    </div>
  );
}
