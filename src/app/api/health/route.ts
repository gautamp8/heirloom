import { sql } from "@/lib/db";

// The desktop bundle runs SQLite, the server runs Postgres. Report
// which one actually answered rather than labelling both "postgres".
const DB_ENGINE =
  process.env.HEIRLOOM_BACKEND === "sqlite" ? "sqlite" : "postgres";
import { ollamaTags, ollamaVersion } from "@/lib/ollama";
import { describeProvider, resolveProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

// The Tauri splash (`tauri://localhost`) probes this route to discover
// the bundled Node port before pivoting to the live app. Local-only
// server, so the wildcard is fine.
const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  const [dbResult, providerResult] = await Promise.allSettled([
    sql`SELECT 1 AS ok`,
    resolveProvider(),
  ]);

  const dbOk =
    dbResult.status === "fulfilled" &&
    (dbResult.value as unknown as { ok: number }[])[0]?.ok === 1;

  if (providerResult.status === "rejected") {
    return Response.json(
      {
        ok: false,
        database: { engine: DB_ENGINE, status: dbOk ? "ok" : "down" },
        // Retained for existing probes that read this key.
        postgres: dbOk ? "ok" : "down",
        provider: {
          status: "misconfigured",
          error: String(
            providerResult.reason instanceof Error
              ? providerResult.reason.message
              : providerResult.reason,
          ),
        },
      },
      { status: 503, headers: CORS },
    );
  }

  const provider = providerResult.value;

  if (provider.profile === "local") {
    const [versionResult, tagsResult] = await Promise.allSettled([
      ollamaVersion(),
      ollamaTags(),
    ]);
    const ollamaUp =
      versionResult.status === "fulfilled" && versionResult.value !== null;
    const tags = tagsResult.status === "fulfilled" ? tagsResult.value : [];

    const synthesisModel =
      provider.synthesis.kind === "ollama" ? provider.synthesis.model : "";
    const embeddingModel =
      provider.embedding.kind === "ollama" ? provider.embedding.model : "";
    const hasSynthesis = tags.some((t) => t === synthesisModel);
    const hasEmbed = tags.some((t) => t.startsWith(embeddingModel));

    const ok = dbOk && ollamaUp && hasSynthesis && hasEmbed;

    return Response.json(
      {
        ok,
        profile: "local",
        database: { engine: DB_ENGINE, status: dbOk ? "ok" : "down" },
        // Retained for existing probes that read this key.
        postgres: dbOk ? "ok" : "down",
        ollama: ollamaUp
          ? {
              status: "ok",
              version:
                versionResult.status === "fulfilled"
                  ? versionResult.value
                  : null,
              models: tags,
              synthesisAvailable: hasSynthesis,
              embeddingAvailable: hasEmbed,
            }
          : { status: "down" },
      },
      { status: ok ? 200 : 503, headers: CORS },
    );
  }

  // Cloud profiles (byok / hosted-demo): config resolved means the
  // endpoint + key + model names are present. No token-burning ping here;
  // an actual failure surfaces on first use with a clear route error.
  const description = await describeProvider();
  const ok = dbOk;
  return Response.json(
    {
      ok,
      profile: provider.profile,
      database: { engine: DB_ENGINE, status: dbOk ? "ok" : "down" },
      // Retained for existing probes that read this key.
      postgres: dbOk ? "ok" : "down",
      provider: { status: "configured", ...description },
    },
    { status: ok ? 200 : 503, headers: CORS },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
