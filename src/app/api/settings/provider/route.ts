import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { sqlAdmin } from "@/lib/db";
import { HttpError, errorResponse, requireSession } from "@/lib/auth";
import {
  BYOK_SETTINGS_KEY,
  ByokSettingsSchema,
  describeProvider,
  invalidateProviderCache,
  readByokSettings,
  type ByokSettings,
} from "@/lib/provider";
import { invalidateEmbeddingGuardCache } from "@/lib/embedding-guard";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

/** GET → active profile + saved BYOK settings with the key masked.
 *  The full key never leaves the server. */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    const byok = await readByokSettings();
    const active = await describeProvider().catch(() => null);
    return Response.json({
      active,
      byok: byok
        ? {
            enabled: byok.enabled,
            base_url: byok.base_url,
            api_key_masked: maskKey(byok.api_key),
            synthesis_model: byok.synthesis_model,
            vision_model: byok.vision_model ?? null,
            embeddings:
              byok.embeddings.mode === "cloud"
                ? { mode: "cloud", model: byok.embeddings.model }
                : { mode: "local" },
          }
        : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Live-check the endpoint + key + model with a one-token generation so
 *  a typo'd key fails at save time, not at first reflection. */
async function testByok(settings: ByokSettings): Promise<void> {
  const provider = createOpenAICompatible({
    name: "byok",
    baseURL: settings.base_url.replace(/\/$/, ""),
    apiKey: settings.api_key,
  });
  try {
    // No token cap: some endpoints want max_tokens, newer OpenAI models
    // want max_completion_tokens; the prompt is tiny either way.
    await generateText({
      model: provider(settings.synthesis_model),
      prompt: "Reply with the single word: ok",
      abortSignal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new HttpError(
      400,
      `byok_test_failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}`,
    );
  }

  if (settings.embeddings.mode === "cloud") {
    const embProvider = createOpenAICompatible({
      name: "byok",
      baseURL: (settings.embeddings.base_url ?? settings.base_url).replace(
        /\/$/,
        "",
      ),
      apiKey: settings.embeddings.api_key ?? settings.api_key,
    });
    try {
      const { embed } = await import("ai");
      const { embedding } = await embed({
        model: embProvider.textEmbeddingModel(settings.embeddings.model),
        value: "ok",
        providerOptions: { byok: { dimensions: 768 } },
        abortSignal: AbortSignal.timeout(20_000),
      });
      if (embedding.length !== 768) {
        throw new HttpError(
          400,
          `byok_embeddings_wrong_dims: model returned ${embedding.length} dimensions; ` +
            "Heirloom's index is 768-dim. Use a model that supports " +
            "dimensions=768 (e.g. text-embedding-3-small), or keep embeddings local.",
        );
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        400,
        `byok_embeddings_test_failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}`,
      );
    }
  }
}

/** POST → validate, live-test, save. Body is the full ByokSettings. */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");

    const body = await req.json();
    // Editing without re-typing the key: a sentinel keeps the saved one.
    if (body?.api_key === "__keep__") {
      const existing = await readByokSettings();
      if (!existing) throw new HttpError(400, "no_saved_key");
      body.api_key = existing.api_key;
    }
    const parsed = ByokSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, `invalid_settings: ${parsed.error.issues[0]?.message}`);
    }
    const settings = parsed.data;

    // BYOK is an instance-global setting (one app_settings row), so a
    // creator enabling it would redirect EVERY creator's inference on the
    // same host. Refuse to enable it on anything that isn't a
    // single-creator install: a host with a forced env profile (the demo)
    // or with more than one vault (a shared/family host). Single-creator
    // devices — the overwhelming case — are unaffected.
    if (settings.enabled) {
      if (process.env.HEIRLOOM_PROVIDER_PROFILE) {
        throw new HttpError(
          409,
          "byok_disabled_on_managed_host: this instance's model is fixed by " +
            "its server configuration and cannot be overridden.",
        );
      }
      const [{ n }] = await sqlAdmin<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM vaults`;
      if (Number(n) > 1) {
        throw new HttpError(
          409,
          "byok_disabled_on_shared_host: bring-your-own-key changes the " +
            "model for everyone on this host, so it's only available on a " +
            "single-creator install.",
        );
      }
      await testByok(settings);
    }

    await sqlAdmin`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${BYOK_SETTINGS_KEY}, ${JSON.stringify(settings)}, ${new Date().toISOString()})
      ON CONFLICT (key) DO UPDATE
        SET value = ${JSON.stringify(settings)},
            updated_at = ${new Date().toISOString()}`;
    invalidateProviderCache();
    invalidateEmbeddingGuardCache();

    const active = await describeProvider();
    return Response.json({ saved: true, active });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE → forget the key and fall back to local. */
export async function DELETE() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");

    await sqlAdmin`DELETE FROM app_settings WHERE key = ${BYOK_SETTINGS_KEY}`;
    invalidateProviderCache();
    invalidateEmbeddingGuardCache();

    const active = await describeProvider();
    return Response.json({ deleted: true, active });
  } catch (err) {
    return errorResponse(err);
  }
}
