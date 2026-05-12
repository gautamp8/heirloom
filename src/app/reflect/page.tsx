import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { readSession } from "@/lib/auth";
import { ReflectionRoom } from "./room";

export default async function Reflect() {
  const session = await readSession();
  if (!session) redirect("/portal");

  return (
    <main className="stage relative min-h-dvh flex flex-col">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/seal.png"
            alt=""
            aria-hidden
            width={22}
            height={22}
            className="w-[22px] h-[22px] object-contain"
          />
          <span className="font-serif italic text-[18px] text-ink">Heirloom</span>
        </Link>
        <span className="eyebrow">Reflection</span>
      </div>

      <ReflectionRoom />
    </main>
  );
}
