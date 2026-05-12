import { sql } from "@/lib/db";
import {
  EMBEDDING_MODEL,
  SYNTHESIS_MODEL,
  ollamaTags,
  ollamaVersion,
} from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await Promise.allSettled([
    sql`SELECT 1 AS ok`,
    ollamaVersion(),
    ollamaTags(),
  ]);

  const [dbResult, versionResult, tagsResult] = checks;

  const postgresOk =
    dbResult.status === "fulfilled" && dbResult.value[0]?.ok === 1;
  const ollamaUp =
    versionResult.status === "fulfilled" && versionResult.value !== null;
  const tags =
    tagsResult.status === "fulfilled" ? tagsResult.value : [];

  const hasSynthesis = tags.some((t) => t === SYNTHESIS_MODEL);
  const hasEmbed = tags.some((t) => t.startsWith(EMBEDDING_MODEL));

  const ok = postgresOk && ollamaUp && hasSynthesis && hasEmbed;

  return Response.json(
    {
      ok,
      postgres: postgresOk ? "ok" : "down",
      ollama: ollamaUp
        ? {
            status: "ok",
            version:
              versionResult.status === "fulfilled" ? versionResult.value : null,
            models: tags,
            synthesisAvailable: hasSynthesis,
            embeddingAvailable: hasEmbed,
          }
        : { status: "down" },
    },
    { status: ok ? 200 : 503 },
  );
}
