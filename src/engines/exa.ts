import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, parseJsonOrSse, readErrorBody } from "../http.ts";
import { isoDaysAgo } from "../time-range.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

export async function searchExaREST(ctx: EngineCallContext): Promise<EngineResult> {
  if (!ctx.apiKey) throw new Error("Exa search requires EXA_API_KEY");
  const body: Record<string, unknown> = {
    query: ctx.query,
    type: "auto",
    contents: { highlights: { highlightsPerUrl: 1 } },
    numResults: ctx.maxResults,
  };
  if (ctx.timeRange) {
    if ("after" in ctx.timeRange) body.startPublishedDate = ctx.timeRange.after;
    else body.startPublishedDate = isoDaysAgo(ctx.timeRange.days);
  }
  const response = await fetchWithTimeout(
    "https://api.exa.ai/search",
    {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${ctx.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "pi-free-search/web-search",
      },
      body: JSON.stringify(body),
    },
    20_000,
    ctx.signal,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401) throw new Error("Exa API key is invalid (HTTP 401) - set EXA_API_KEY");
    if (response.status === 402) {
      throw new Error(
        `Exa quota/billing error (HTTP 402) - the key is valid, but its team has no usable credits or hit a usage limit. ${detail}`,
      );
    }
    throw new Error(`Exa API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; highlights?: string[]; publishedDate?: string }>;
  };
  const sources: Source[] = [];
  for (const result of data.results ?? []) {
    const snippet = result.highlights?.find((h) => h.trim().length > 0);
    if (!snippet || !result.url) continue;
    sources.push({
      url: result.url,
      ...(result.title ? { title: result.title } : {}),
      snippet,
      ...(result.publishedDate ? { publishedAt: result.publishedDate } : {}),
    });
  }
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}

export async function searchExaMCP(ctx: EngineCallContext): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    EXA_MCP_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: "web_search_exa", arguments: { query: ctx.query, numResults: ctx.maxResults } },
      }),
    },
    20_000,
    ctx.signal,
  );
  if (!response.ok) throw new Error(`Exa MCP error (HTTP ${response.status})`);
  const json = parseJsonOrSse(await response.text()) as {
    error?: { message?: string };
    result?: { content?: Array<{ type?: string; text?: string }> };
  } | null;
  if (!json || json.error) throw new Error(`Exa MCP error: ${json?.error?.message ?? "no data"}`);
  const textBlocks = (json.result?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
  const sources: Source[] = [];
  for (const block of textBlocks.split(/\n(?=Title:)/)) {
    const title = block.match(/^Title: (.+)$/m)?.[1];
    const url = block.match(/^URL: (\S+)$/m)?.[1];
    const published = block.match(/^Published: (.+)$/m)?.[1];
    const highlights = block
      .split(/^Highlights:$/m)[1]
      ?.split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("..."))
      .slice(0, 3)
      .join(" ");
    if (!url) continue;
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(highlights ? { snippet: highlights.slice(0, 300) } : {}),
      ...(published && /^\d{4}-\d{2}-\d{2}/.test(published) ? { publishedAt: published } : {}),
    });
  }
  return { sources, truncated: false };
}

export async function searchExa(ctx: EngineCallContext): Promise<EngineResult> {
  if (ctx.apiKey) return searchExaREST(ctx);
  return searchExaMCP(ctx);
}
