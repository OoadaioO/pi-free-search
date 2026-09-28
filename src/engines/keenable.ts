import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, readErrorBody } from "../http.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

const KEENABLE_URL = "https://api.keenable.ai/v1/search";
const KEENABLE_MCP_URL = "https://api.keenable.ai/mcp";

export function formatKeenableRelative(days: number): string {
  if (days <= 0.5) return "12h";
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

function publishedAfter(ctx: EngineCallContext): string | undefined {
  if (!ctx.timeRange) return undefined;
  if ("after" in ctx.timeRange) return ctx.timeRange.after;
  return formatKeenableRelative(ctx.timeRange.days);
}

function extractKeenableSources(text: string, maxResults: number): Source[] {
  const sources: Source[] = [];
  for (const block of String(text).split(/\n(?=Title:)/)) {
    const title = block.match(/^Title: (.+)$/m)?.[1];
    const url = block.match(/^URL: (\S+)$/m)?.[1];
    const published = block.match(/^Published: (.+)$/m)?.[1] ?? block.match(/^Acquired: (.+)$/m)?.[1];
    const snippets = block
      .split(/^Snippets:$/m)[1]
      ?.split("\n")
      .filter((line) => line.trim())
      .slice(0, 3)
      .join(" ");
    if (!url) continue;
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(snippets ? { snippet: snippets.slice(0, 300) } : {}),
      ...(published && /^\d{4}-\d{2}-\d{2}/.test(published) ? { publishedAt: published } : {}),
    });
  }
  return uniqueSources(sources, maxResults);
}

async function searchKeenableREST(ctx: EngineCallContext): Promise<EngineResult> {
  const body: Record<string, unknown> = { query: ctx.query, mode: "realtime" };
  const after = publishedAfter(ctx);
  if (after) body.published_after = after;
  const response = await fetchWithTimeout(
    KEENABLE_URL,
    {
      method: "POST",
      headers: { "x-api-key": ctx.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    },
    20_000,
    ctx.signal,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401) throw new Error("Keenable API key is invalid (HTTP 401) - set KEENABLE_API_KEY");
    throw new Error(`Keenable API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; snippet?: string; description?: string; published_at?: string }>;
  };
  const sources = (data.results ?? [])
    .filter((row) => row.url)
    .map((row) => ({
      url: row.url as string,
      ...(row.title ? { title: String(row.title) } : {}),
      ...(row.snippet ?? row.description ? { snippet: String(row.snippet ?? row.description).slice(0, 300) } : {}),
      ...(row.published_at ? { publishedAt: String(row.published_at) } : {}),
    }));
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}

async function searchKeenableMCP(ctx: EngineCallContext): Promise<EngineResult> {
  const arguments_: Record<string, unknown> = { query: ctx.query };
  const after = publishedAfter(ctx);
  if (after) arguments_.published_after = after;
  const response = await fetchWithTimeout(
    KEENABLE_MCP_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: "search_web_pages", arguments: arguments_ },
      }),
    },
    25_000,
    ctx.signal,
  );
  if (!response.ok) throw new Error(`Keenable MCP error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    error?: { message?: string };
    result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  };
  if (data.error) throw new Error(`Keenable MCP error: ${data.error.message ?? "unknown"}`);
  const text = (data.result?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
  if (data.result?.isError) throw new Error(`Keenable MCP error: ${text.slice(0, 200)}`);
  return { sources: extractKeenableSources(text, ctx.maxResults), truncated: false };
}

export async function searchKeenable(ctx: EngineCallContext): Promise<EngineResult> {
  if (ctx.apiKey) return searchKeenableREST(ctx);
  return searchKeenableMCP(ctx);
}
