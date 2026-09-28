import { uniqueSources, stripTags } from "../html.ts";
import { fetchHtmlWithRetry, ACCEPT_LANG } from "../http.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

const BING_URL = "https://www.bing.com/search";

const MARKET_TO_LANG: Record<string, string> = {
  "zh-CN": "zh-CN,zh;q=0.9,en;q=0.8",
  "zh-TW": "zh-TW,zh;q=0.9,en;q=0.8",
  "en-US": "en-US,en;q=0.9",
  "en-GB": "en-GB,en;q=0.9",
  "ru-RU": "ru-RU,ru;q=0.9,en;q=0.8",
  "ja-JP": "ja-JP,ja;q=0.9,en;q=0.8",
  "de-DE": "de-DE,de;q=0.9,en;q=0.8",
  "fr-FR": "fr-FR,fr;q=0.9,en;q=0.8",
  "es-ES": "es-ES,es;q=0.9,en;q=0.8",
  "ko-KR": "ko-KR,ko;q=0.9,en;q=0.8",
};

export function queryOverlapTokens(query: string): string[] {
  const tokens = new Set<string>();
  for (const run of String(query).match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length <= 2) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  for (const word of String(query).toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 2) tokens.add(word);
  }
  return [...tokens];
}

export function looksRelevant(query: string, sources: Source[]): boolean {
  const tokens = queryOverlapTokens(query);
  if (tokens.length === 0) return true;
  return sources.some((source) => {
    const hay = `${source.title ?? ""} ${source.snippet ?? ""} ${source.url ?? ""}`.toLowerCase();
    return tokens.some((token) => hay.includes(token.toLowerCase()));
  });
}

export async function searchBing(ctx: EngineCallContext): Promise<EngineResult> {
  const market = ctx.bingMarket || "zh-CN";
  const params = new URLSearchParams({ q: ctx.query, mkt: market });
  const acceptLang = MARKET_TO_LANG[market] ?? ACCEPT_LANG;
  if (ctx.safeSearch === "off") params.set("adlt", "off");
  else if (ctx.safeSearch === "moderate") params.set("adlt", "moderate");
  else if (ctx.safeSearch === "strict") params.set("adlt", "strict");
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, ctx.signal, acceptLang);
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const sources: Source[] = [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hrefMatch?.[1]) continue;
    sources.push({
      url: hrefMatch[1],
      ...(titleMatch?.[1] ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch?.[1] ? { snippet: stripTags(snippetMatch[1]) } : {}),
    });
  }
  if (sources.length > 0 && !looksRelevant(ctx.query, sources)) {
    return { sources: [], truncated: false };
  }
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}
