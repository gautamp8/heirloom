import Image from "next/image";

export default function Home() {
  return (
    <main className="stage relative min-h-dvh flex flex-col px-8 pt-16 pb-10">
      {/* Center stack — seal + name + tagline */}
      <div className="flex-1 flex flex-col items-center justify-center gap-12 relative z-10">
        <div className="w-32 h-32">
          <Image
            src="/seal-2x.png"
            alt="Heirloom seal"
            width={256}
            height={256}
            priority
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="h-display">
            <em>Heirloom</em>
          </h1>
          <p className="p-body max-w-[240px]">
            Preserve presence across generations.
          </p>
        </div>
      </div>

      {/* Bottom stack — entry CTAs + footer */}
      <div className="flex flex-col items-center gap-4 relative z-10">
        <button className="btn btn-full max-w-[260px]">
          Begin a new archive
        </button>
        <button className="btn-ghost">I have a sealed letter</button>
        <p className="p-meta mt-3">
          Local-first · Nothing leaves this device
        </p>
      </div>
    </main>
  );
}
