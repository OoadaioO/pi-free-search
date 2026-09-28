import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, readErrorBody } from "../http.ts";
import { approximateTimeRange } from "../time-range.ts";
import type { EngineCallContext, EngineResult } from "../types.ts";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/search";
const FIRECRAWL_TBS = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" } as const;

function formatFirecrawlDate(date: string): string {
  const [y, m, d] = String(date).split("-").map((n) => parseInt(n, 10));
  return `${m}/${d}/${y}`;
}

export async function searchFirecrawl(ctx: EngineCallContext): Promise<EngineResult> {
  const body: Record<string, unknown> = { query: ctx.query, limit: Math.min(Math.max(ctx.maxResults, 1), 10) };
  if (ctx.timeRange) {
    if ("after" in ctx.timeRange) {
      body.tbs = `cdr:1,cd_min:${formatFirecrawlDate(ctx.timeRange.after)}`;
    } else {
      const tr = approximateTimeRange(ctx.timeRange.days);
      if (FIRECRAWL_TBS[tr]) body.tbs = FIRECRAWL_TBS[tr];
    }
  }
  const response = await fetchWithTimeout(
    FIRECRAWL_URL,
    {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(ctx.apiKey ? { authorization: `Bearer ${ctx.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    },
    20_000,
    ctx.signal,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401) throw new Error("Firecrawl API key is invalid (HTTP 401) - set FIRECRAWL_API_KEY");
    if (response.status === 429) {
      throw new Error("Firecrawl rate limit exceeded (HTTP 429) - configure FIRECRAWL_API_KEY for higher limits");
    }
    throw new Error(`Firecrawl API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    data?: { web?: Array<{ url?: string; title?: string; description?: string }> };
  };
  const sources = (data.data?.web ?? [])
    .filter((row) => row.url)
    .map((row) => ({
      url: row.url as string,
      ...(row.title ? { title: String(row.title) } : {}),
      ...(row.description ? { snippet: String(row.description).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}
