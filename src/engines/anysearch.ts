import { fetchWithTimeout } from "../http.ts";
import type { EngineCallContext, EngineResult } from "../types.ts";

const ANYSEARCH_URL = "https://api.anysearch.com/v1/search";
const ANYSEARCH_KEY_INVALID_NOTE = "AnySearch key 无效，本次已忽略该 key，改回免费匿名";

let ignoredAnysearchKey = "";

export async function searchAnysearch(ctx: EngineCallContext): Promise<EngineResult> {
  const trimmedKey = ctx.apiKey.trim();
  const keyIgnoredSticky = Boolean(trimmedKey) && trimmedKey === ignoredAnysearchKey;
  const sendKey = trimmedKey && !keyIgnoredSticky ? trimmedKey : "";
  const doFetch = async (key: string) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    return await fetchWithTimeout(
      ANYSEARCH_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query: ctx.query, max_results: ctx.maxResults }),
      },
      12_000,
      ctx.signal,
    );
  };

  let response: Response;
  let keyRejected = false;
  try {
    response = await doFetch(sendKey);
    if ((response.status === 401 || response.status === 403) && sendKey) {
      ignoredAnysearchKey = sendKey;
      keyRejected = true;
      response = await doFetch("");
    }
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    throw new Error(`AnySearch request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      keyRejected
        ? `${ANYSEARCH_KEY_INVALID_NOTE} (HTTP ${response.status})`
        : `AnySearch API error (HTTP ${response.status})`,
    );
  }
  if (!response.ok) throw new Error(`AnySearch API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    code?: number;
    message?: string;
    data?: { results?: Array<{ url?: string; title?: string; snippet?: string }> };
  };
  if (data.code !== 0) throw new Error(`AnySearch API error: ${data.message ?? data.code}`);
  const results = data.data?.results ?? [];
  return {
    sources: results
      .filter((row) => row.url)
      .map((row) => ({
        url: row.url as string,
        ...(row.title ? { title: String(row.title) } : {}),
        ...(row.snippet ? { snippet: String(row.snippet).slice(0, 300) } : {}),
      })),
    truncated: false,
    ...(keyRejected || keyIgnoredSticky ? { content: ANYSEARCH_KEY_INVALID_NOTE } : {}),
  };
}
