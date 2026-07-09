import { UnlockForm } from "./form";
import Image from "next/image";

export default function ExecutorUnlock() {
  return (
    <main className="stage relative min-h-dvh flex flex-col px-6 pt-10 pb-16">
      <div className="flex flex-col items-center text-center max-w-[460px] mx-auto w-full">
        <Image
          src="/seal-2x.png"
          alt="Heirloom seal"
          width={88}
          height={88}
          className="w-[88px] h-[88px] object-contain mb-8 opacity-90"
          priority
        />
        <p className="eyebrow mb-2">An archive needs to be opened</p>
        <h1 className="h-title mb-4">
          <em>You were trusted with this.</em>
        </h1>
        <p className="p-body max-w-[400px] mb-10">
          Enter the passphrase that was given to you. This will release the
          contents to the people the creator chose. You won&rsquo;t see those
          contents yourself — only the confirmation that release has happened.
        </p>

        <UnlockForm />

        <p className="p-meta mt-12">
          The passphrase is checked here and never stored
        </p>
      </div>
    </main>
  );
}
