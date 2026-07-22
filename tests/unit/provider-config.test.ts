import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupSqlite } from "../helpers/db";

// Backend is frozen at import time, so the provider module is loaded
// dynamically after setupSqlite() points @/lib/db at a throwaway file.
let sql: Awaited<ReturnType<typeof setupSqlite>>["sql"];
let provider: typeof import("@/lib/provider");

const ENV_KEYS = [
  "HEIRLOOM_PROVIDER_PROFILE",
  "HEIRLOOM_RETRIEVAL_FLOOR",
  "OLLAMA_BASE_URL",
  "OLLAMA_SYNTHESIS_MODEL",
  "OLLAMA_EMBEDDING_MODEL",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_CHAT_DEPLOYMENT",
  "AZURE_OPENAI_EMBED_DEPLOYMENT",
  "AZURE_OPENAI_EMBED_MODEL",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeAll(async () => {
  const db = await setupSqlite();
  sql = db.sql;
  provider = await import("@/lib/provider");
});

beforeEach(async () => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  await sql`DELETE FROM app_settings WHERE key = ${provider.BYOK_SETTINGS_KEY}`;
  provider.invalidateProviderCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  provider.invalidateProviderCache();
});

async function saveByok(value: unknown) {
  await sql`INSERT INTO app_settings (key, value)
            VALUES (${provider.BYOK_SETTINGS_KEY}, ${JSON.stringify(value)})`;
}

function setAzureEnv() {
  process.env.HEIRLOOM_PROVIDER_PROFILE = "hosted-demo";
  process.env.AZURE_OPENAI_ENDPOINT = "https://demo.openai.azure.com/";
  process.env.AZURE_OPENAI_API_KEY = "azure-test-key";
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT = "chat-dep";
  process.env.AZURE_OPENAI_EMBED_DEPLOYMENT = "embed-dep";
}

describe("profile resolution", () => {
  it("defaults to the local ollama profile with env-default models", async () => {
    const p = await provider.resolveProvider();
    expect(p.profile).toBe("local");
    expect(p.synthesis).toEqual({
      kind: "ollama",
      baseURL: "http://localhost:11434",
      model: "gemma4:e4b",
    });
    expect(p.vision).toBe(p.synthesis);
    expect(p.embedding).toEqual({
      kind: "ollama",
      baseURL: "http://localhost:11434",
      model: "embeddinggemma",
    });
    expect(p.embeddingDims).toBe(768);
    expect(p.embeddingIdentity).toBe("ollama/embeddinggemma@768");
    expect(p.retrievalFloor).toBe(0.3);
  });

  it("uncalibrated embedding identity falls back to the default floor", async () => {
    process.env.OLLAMA_EMBEDDING_MODEL = "custom-embedder";
    const p = await provider.resolveProvider();
    expect(p.embeddingIdentity).toBe("ollama/custom-embedder@768");
    expect(p.embedding).toMatchObject({ kind: "ollama", model: "custom-embedder" });
    expect(p.retrievalFloor).toBe(0.3);
  });

  it("HEIRLOOM_RETRIEVAL_FLOOR overrides the floor for any identity", async () => {
    process.env.HEIRLOOM_RETRIEVAL_FLOOR = "0.42";
    expect((await provider.resolveProvider()).retrievalFloor).toBe(0.42);

    provider.invalidateProviderCache();
    process.env.OLLAMA_EMBEDDING_MODEL = "custom-embedder";
    expect((await provider.resolveProvider()).retrievalFloor).toBe(0.42);

    provider.invalidateProviderCache();
    setAzureEnv();
    expect((await provider.resolveProvider()).retrievalFloor).toBe(0.42);
  });

  it("hosted-demo without azure env rejects naming the missing vars", async () => {
    process.env.HEIRLOOM_PROVIDER_PROFILE = "hosted-demo";
    await expect(provider.resolveProvider()).rejects.toThrow(
      /AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_CHAT_DEPLOYMENT and AZURE_OPENAI_EMBED_DEPLOYMENT/,
    );
  });

  it("hosted-demo with full azure env resolves azure targets", async () => {
    setAzureEnv();
    const p = await provider.resolveProvider();
    expect(p.profile).toBe("hosted-demo");
    expect(p.synthesis).toEqual({
      kind: "azure",
      endpoint: "https://demo.openai.azure.com",
      apiKey: "azure-test-key",
      deployment: "chat-dep",
    });
    expect(p.vision).toBe(p.synthesis);
    expect(p.embedding).toEqual({
      kind: "azure",
      endpoint: "https://demo.openai.azure.com",
      apiKey: "azure-test-key",
      deployment: "embed-dep",
    });
    expect(p.embeddingIdentity).toBe("azure/text-embedding-3-small@768");
    expect(p.retrievalFloor).toBe(0.3);
  });

  it("AZURE_OPENAI_EMBED_MODEL feeds the embedding identity", async () => {
    setAzureEnv();
    process.env.AZURE_OPENAI_EMBED_MODEL = "text-embedding-3-large";
    const p = await provider.resolveProvider();
    expect(p.embeddingIdentity).toBe("azure/text-embedding-3-large@768");
  });
});

describe("byok resolution from app_settings", () => {
  const base = {
    enabled: true,
    base_url: "https://openrouter.ai/api/v1",
    api_key: "sk-or-0123456789ab",
    synthesis_model: "x",
  };

  it("enabled byok routes synthesis to openai-compatible, embeddings stay local", async () => {
    await saveByok(base);
    const p = await provider.resolveProvider();
    expect(p.profile).toBe("byok");
    expect(p.synthesis).toEqual({
      kind: "openai-compatible",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-0123456789ab",
      model: "x",
    });
    expect(p.vision).toBe(p.synthesis);
    expect(p.embedding.kind).toBe("ollama");
    expect(p.embeddingIdentity).toBe("ollama/embeddinggemma@768");
  });

  it("disabled byok settings leave the profile local", async () => {
    await saveByok({ ...base, enabled: false });
    expect((await provider.resolveProvider()).profile).toBe("local");
  });

  it("cloud embeddings switch the identity to openai/<model>@768", async () => {
    await saveByok({
      ...base,
      embeddings: { mode: "cloud", model: "text-embedding-3-small" },
    });
    const p = await provider.resolveProvider();
    expect(p.embedding).toEqual({
      kind: "openai-compatible",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-0123456789ab",
      model: "text-embedding-3-small",
    });
    expect(p.embeddingIdentity).toBe("openai/text-embedding-3-small@768");
  });

  it("malformed stored JSON reads as null and resolves local without throwing", async () => {
    await sql`INSERT INTO app_settings (key, value)
              VALUES (${provider.BYOK_SETTINGS_KEY}, ${"{not-valid-json"})`;
    expect(await provider.readByokSettings()).toBeNull();
    expect((await provider.resolveProvider()).profile).toBe("local");
  });
});

describe("ByokSettingsSchema", () => {
  const valid = {
    enabled: true,
    api_key: "sk-or-0123456789ab",
    synthesis_model: "x",
  };

  it("rejects a malformed base_url", () => {
    const out = provider.ByokSettingsSchema.safeParse({
      ...valid,
      base_url: "not-a-url",
    });
    expect(out.success).toBe(false);
  });

  it("rejects a too-short api_key", () => {
    const out = provider.ByokSettingsSchema.safeParse({
      ...valid,
      api_key: "short",
    });
    expect(out.success).toBe(false);
  });

  it("defaults base_url to openrouter and embeddings to local", () => {
    const out = provider.ByokSettingsSchema.parse(valid);
    expect(out.base_url).toBe("https://openrouter.ai/api/v1");
    expect(out.embeddings).toEqual({ mode: "local" });
  });

  it("accepts cloud embeddings with their own base_url and api_key", () => {
    const out = provider.ByokSettingsSchema.safeParse({
      ...valid,
      embeddings: {
        mode: "cloud",
        model: "text-embedding-3-small",
        base_url: "https://api.openai.com/v1",
        api_key: "sk-openai-separate-key",
      },
    });
    expect(out.success).toBe(true);
    if (out.success && out.data.embeddings.mode === "cloud") {
      expect(out.data.embeddings.base_url).toBe("https://api.openai.com/v1");
      expect(out.data.embeddings.api_key).toBe("sk-openai-separate-key");
    }
  });
});
