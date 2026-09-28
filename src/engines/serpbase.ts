import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, readErrorBody } from "../http.ts";
import type { EngineCallContext, EngineResult } from "../types.ts";

const SERPBASE_URL = "https://api.serpbase.dev/google/search";

const MARKET_TO_LOCALE: Record<string, { hl: string; gl: string }> = {
  "zh-CN": { hl: "zh-CN", gl: "cn" },
  "zh-TW": { hl: "zh-TW", gl: "tw" },
  "en-US": { hl: "en", gl: "us" },
  "en-GB": { hl: "en", gl: "uk" },
  "ru-RU": { hl: "ru", gl: "ru" },
  "ja-JP": { hl: "ja", gl: "jp" },
  "de-DE": { hl: "de", gl: "de" },
  "fr-FR": { hl: "fr", gl: "fr" },
  "es-ES": { hl: "es", gl: "es" },
  "ko-KR": { hl: "ko", gl: "kr" },
};

export async function searchSerpbase(ctx: EngineCallContext): Promise<EngineResult> {
  if (!ctx.apiKey) throw new Error("SerpBase search requires SERPBASE_API_KEY");
  const locale = MARKET_TO_LOCALE[ctx.bingMarket] ?? MARKET_TO_LOCALE["en-US"]!;
  const response = await fetchWithTimeout(
    SERPBASE_URL,
    {
      method: "POST",
      redirect: "error",
      headers: {
        "X-API-Key": ctx.apiKey,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "pi-free-search/web-search",
      },
      body: JSON.stringify({ q: ctx.query, hl: locale.hl, gl: locale.gl, page: 1 }),
    },
    15_000,
    ctx.signal,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new Error(`SerpBase API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    status?: number;
    error?: string;
    organic?: Array<{ link?: string; title?: string; snippet?: string; published_at?: string; date?: string }>;
  };
  if (data.status !== 0) {
    if (data.status === 1001) {
      throw new Error("SerpBase API key is invalid or missing (status 1001) - set SERPBASE_API_KEY");
    }
    throw new Error(`SerpBase API error (status ${data.status}): ${String(data.error ?? "").slice(0, 200)}`);
  }
  const sources = (data.organic ?? [])
    .filter((row) => row.link)
    .map((row) => ({
      url: row.link as string,
      ...(row.title ? { title: String(row.title) } : {}),
      ...(row.snippet ? { snippet: String(row.snippet) } : {}),
      ...(row.published_at ?? row.date ? { publishedAt: String(row.published_at ?? row.date) } : {}),
    }));
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}
