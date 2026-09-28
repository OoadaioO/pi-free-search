import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, readErrorBody } from "../http.ts";
import { approximateTimeRange } from "../time-range.ts";
import type { EngineCallContext, EngineResult } from "../types.ts";

const TAVILY_URL = "https://api.tavily.com/search";

export async function searchTavily(ctx: EngineCallContext): Promise<EngineResult> {
  const body: Record<string, unknown> = {
    query: ctx.query,
    max_results: Math.min(ctx.maxResults, 20),
    search_depth: "basic",
  };
  if (ctx.timeRange) {
    const days = "days" in ctx.timeRange ? ctx.timeRange.days : 7;
    body.time_range = approximateTimeRange(days);
  }
  const response = await fetchWithTimeout(
    TAVILY_URL,
    {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(ctx.apiKey ? { authorization: `Bearer ${ctx.apiKey}` } : { "x-tavily-access-mode": "keyless" }),
      },
      body: JSON.stringify(body),
    },
    15_000,
    ctx.signal,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401) throw new Error("Tavily API key is invalid (HTTP 401) - set TAVILY_API_KEY");
    throw new Error(`Tavily API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as { results?: Array<{ url?: string; title?: string; content?: string }> };
  const sources = (data.results ?? [])
    .filter((row) => row.url)
    .map((row) => ({
      url: row.url as string,
      ...(row.title ? { title: String(row.title) } : {}),
      ...(row.content ? { snippet: String(row.content).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}
