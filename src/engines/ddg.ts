import { uniqueSources, stripTags } from "../html.ts";
import { fetchHtmlWithRetry } from "../http.ts";
import { approximateTimeRange } from "../time-range.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";

function extractDdgUrl(rel: string | undefined): string | null {
  if (!rel) return null;
  const match = rel.match(/uddg=([^&]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  if (rel.startsWith("//")) return `https:${rel}`;
  return rel;
}

function adltValue(safeSearch: EngineCallContext["safeSearch"]): string {
  return safeSearch === "strict" ? "1" : safeSearch === "moderate" ? "0" : "-1";
}

function timeDf(ctx: EngineCallContext): string | undefined {
  if (!ctx.timeRange) return undefined;
  const days = "days" in ctx.timeRange ? ctx.timeRange.days : 7;
  return { day: "d", week: "w", month: "m", year: "y" }[approximateTimeRange(days)];
}

export async function searchDdgHtml(ctx: EngineCallContext): Promise<EngineResult> {
  const params = new URLSearchParams({ q: ctx.query });
  params.set("adlt", adltValue(ctx.safeSearch));
  const df = timeDf(ctx);
  if (df) params.set("df", df);
  const html = await fetchHtmlWithRetry(`${DDG_HTML_URL}?${params}`, ctx.signal);
  const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) ?? [];
  const sources: Source[] = [];
  for (const block of blocks) {
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/);
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);
    const dateMatch = block.match(/<span[^>]*>\s*([\dT:.+-]+)\s*<\/span>/);
    const url = extractDdgUrl(urlMatch?.[1]);
    if (!url) continue;
    sources.push({
      url,
      ...(titleMatch?.[1] ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch?.[1] ? { snippet: stripTags(snippetMatch[1]) } : {}),
      ...(dateMatch?.[1] ? { publishedAt: dateMatch[1] } : {}),
    });
  }
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}

export async function searchDdgLite(ctx: EngineCallContext): Promise<EngineResult> {
  const params = new URLSearchParams({ q: ctx.query });
  params.set("adlt", adltValue(ctx.safeSearch));
  const df = timeDf(ctx);
  if (df) params.set("df", df);
  const html = await fetchHtmlWithRetry(`${DDG_LITE_URL}?${params}`, ctx.signal);
  const linkMatches = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? [];
  const snippetMatches = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? [];
  const sources: Source[] = [];
  for (let i = 0; i < linkMatches.length; i++) {
    const tag = linkMatches[i] ?? "";
    const hrefMatch = tag.match(/href="([^"]*)"/);
    const titleMatch = tag.match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/);
    if (!hrefMatch?.[1]) continue;
    const url = extractDdgUrl(hrefMatch[1]);
    if (!url) continue;
    const snippet = snippetMatches[i]?.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1];
    sources.push({
      url,
      ...(titleMatch?.[1] ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippet ? { snippet: stripTags(snippet) } : {}),
    });
  }
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}
