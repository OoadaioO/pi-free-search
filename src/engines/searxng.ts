import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, USER_AGENT } from "../http.ts";
import { approximateTimeRange } from "../time-range.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

const SEARXNG_INSTANCES = [
  "https://opnxng.com",
  "https://priv.au",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://search.inetol.net",
  "https://paulgo.io",
];

const SEARXNG_TIME = { day: "day", week: "week", month: "month", year: "year" } as const;

export async function searchSearxng(ctx: EngineCallContext): Promise<EngineResult> {
  const errors: string[] = [];
  for (const base of SEARXNG_INSTANCES) {
    try {
      const params = new URLSearchParams({ q: ctx.query, format: "json" });
      if (ctx.timeRange) {
        const days = "days" in ctx.timeRange ? ctx.timeRange.days : 7;
        const tr = SEARXNG_TIME[approximateTimeRange(days)];
        if (tr) params.set("time_range", tr);
      }
      const response = await fetchWithTimeout(
        `${base}/search?${params}`,
        { headers: { "user-agent": USER_AGENT, accept: "application/json" } },
        8000,
        ctx.signal,
      );
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = (await response.json().catch(() => null)) as { results?: Array<{ url?: string; title?: string; content?: string }> } | null;
      if (!data || !Array.isArray(data.results)) {
        errors.push(`${base}: invalid JSON`);
        continue;
      }
      const sources: Source[] = data.results
        .filter((row) => row.url)
        .map((row) => ({
          url: row.url as string,
          ...(row.title ? { title: String(row.title) } : {}),
          ...(row.content ? { snippet: String(row.content) } : {}),
        }));
      if (sources.length > 0) {
        return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
      }
      errors.push(`${base}: 0 results`);
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured";
  throw new Error(`all SearXNG instances failed: ${detail.slice(0, 300)}`);
}
