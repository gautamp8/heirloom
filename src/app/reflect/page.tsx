import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { sqlAdmin } from "@/lib/db";
import { BrandMark } from "@/app/_components/brand-mark";
import { ReflectionRoom } from "./room";

const CREATOR_PROMPTS = [
  "Tell me about your grandmother.",
  "What did you learn from your father?",
  "What did you wear when you got married?",
];

/** Prompts tailored to seed archives so judges/visitors land on grounded
 *  answers immediately. Keyed by creator display_name (case-insensitive). */
const ARCHIVE_PROMPTS: Record<string, string[]> = {
  "carl sagan": [
    "What did you write about the pale blue dot?",
    "What are we made of?",
    "What is science, really?",
  ],
};

export default async function Reflect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/portal");

  let prompts = CREATOR_PROMPTS;
  if (session.role === "nominee" && sqlAdmin) {
    const [row] = await sqlAdmin<{ creator_name: string }[]>`
      SELECT u.display_name AS creator_name
      FROM vaults v JOIN users u ON u.id = v.creator_id
      WHERE v.id = ${session.vault_id} LIMIT 1`;
    const seeded = row && ARCHIVE_PROMPTS[row.creator_name.toLowerCase()];
    if (seeded) prompts = seeded;
  }

  const { q } = await searchParams;
  const initial = typeof q === "string" ? q.trim().slice(0, 240) : "";

  return (
    <main className="stage relative min-h-dvh flex flex-col">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
        <BrandMark />

        <span className="eyebrow">Reflection</span>
      </div>

      <ReflectionRoom suggestedPrompts={prompts} initialQuestion={initial} />
    </main>
  );
}
