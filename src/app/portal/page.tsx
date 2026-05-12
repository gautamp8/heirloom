import Image from "next/image";
import { PortalActions } from "./actions";

export default function Portal() {
  return (
    <main className="stage relative min-h-dvh flex flex-col px-8 pt-16 pb-10">
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

      <PortalActions />
    </main>
  );
}
