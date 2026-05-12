import { redirect } from "next/navigation";
import Image from "next/image";
import { readSession } from "@/lib/auth";
import { SetupRoom } from "./setup-room";

export default async function ExecutorSetup() {
  const session = await readSession();
  if (!session) redirect("/portal");
  if (session.role !== "creator") redirect("/");

  return (
    <main className="stage relative min-h-dvh flex flex-col px-6 pt-10 pb-16">
      <div className="flex flex-col items-center text-center max-w-[520px] mx-auto w-full">
        <Image
          src="/seal-2x.png"
          alt=""
          aria-hidden
          width={64}
          height={64}
          className="w-16 h-16 object-contain mb-6 opacity-90"
        />
        <p className="eyebrow mb-2">A trusted person</p>
        <h1 className="h-title mb-4">
          <em>Who can open this if you can&rsquo;t?</em>
        </h1>
        <p className="p-body max-w-[440px] mb-10">
          Generate a passphrase to give to someone you trust. If the archive
          ever needs to be opened without you, they enter the passphrase and
          everything you&rsquo;ve assigned is released to the people you
          chose. They won&rsquo;t see the contents themselves.
        </p>

        <SetupRoom />
      </div>
    </main>
  );
}
