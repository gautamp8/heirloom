import { notFound } from "next/navigation";
import { readSession } from "@/lib/auth";
import { sqlAdmin } from "@/lib/db";
import { DevControls } from "./controls";

export const dynamic = "force-dynamic";

type Snapshot = {
  current_role: "creator" | "nominee" | null;
  current_name: string | null;
  captures: number;
  nominees: number;
  released: number;
  reflections: number;
  has_executor: boolean;
};

export default async function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  if (!sqlAdmin) return <p>No admin DB.</p>;

  const session = await readSession();
  let currentName: string | null = null;
  if (session) {
    const [u] = await sqlAdmin<{ display_name: string }[]>`
      SELECT display_name FROM users WHERE id = ${session.user_id}
    `;
    currentName = u?.display_name ?? null;
  }

  const [counts] = await sqlAdmin<
    {
      captures: number;
      nominees: number;
      released: number;
      reflections: number;
      executors: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM captures)                                AS captures,
      (SELECT COUNT(*)::int FROM nominees)                                AS nominees,
      (SELECT COUNT(*)::int FROM nominee_releases WHERE released_at IS NOT NULL) AS released,
      (SELECT COUNT(*)::int FROM reflections)                             AS reflections,
      (SELECT COUNT(*)::int FROM executor_credentials)                    AS executors
  `;

  const snapshot: Snapshot = {
    current_role: session?.role ?? null,
    current_name: currentName,
    captures: counts.captures,
    nominees: counts.nominees,
    released: counts.released,
    reflections: counts.reflections,
    has_executor: counts.executors > 0,
  };

  return (
    <main className="stage relative min-h-dvh px-6 pt-10 pb-16">
      <div className="max-w-[680px] mx-auto">
        <p className="eyebrow mb-2">Dev console</p>
        <h1 className="h-title mb-3">
          <em>Quick navigation</em>
        </h1>
        <p className="p-body mb-10">
          Switch identity, jump between every surface, reseed when needed.
          This page is hidden in production.
        </p>

        <DevControls snapshot={snapshot} />
      </div>
    </main>
  );
}
