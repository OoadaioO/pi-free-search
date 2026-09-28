import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, parseJsonOrSse, readErrorBody } from "../http.ts";
import { isoDaysAgo } from "../time-range.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

const PARALLEL_URL = "https://api.parallel.ai/v1/search";
const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp";

const PARALLEL_MCP_SESSION = (() => {
  let id = "";
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
})();

function afterDate(ctx: EngineCallContext): string | undefined {
  if (!ctx.timeRange) return undefined;
  if ("after" in ctx.timeRange) return ctx.timeRange.after;
  return isoDaysAgo(ctx.timeRange.days).slice(0, 10);
}

function mapParallelResults(
  results: Array<{ url?: string; title?: string; excerpts?: string[]; publish_date?: string }> | undefined,
  maxResults: number,
): Source[] {
  const sources = (results ?? [])
    .filter((row) => row.url)
    .map((row) => {
      const excerpt = (row.excerpts ?? []).find((item) => String(item).trim().length > 0);
      return {
        url: row.url as string,
        ...(row.title ? { title: String(row.title) } : {}),
        ...(excerpt ? { snippet: String(excerpt).slice(0, 300) } : {}),
        ...(row.publish_date ? { publishedAt: String(row.publish_date) } : {}),
      };
    });
  return uniqueSources(sources, maxResults);
}

export async function searchParallelREST(ctx: EngineCallContext): Promise<EngineResult> {
  if (!ctx.apiKey) throw new Error("Parallel search requires PARALLEL_API_KEY");
  const body: Record<string, unknown> = {
    objective: ctx.query,
    search_queries: [ctx.query],
    mode: "fast",
    advanced_settings: { max_results: Math.min(Math.max(ctx.maxResults, 1), 20) },
  };
  const after = afterDate(ctx);
  if (after) {
    (body.advanced_settings as Record<string, unknown>).source_policy = { after_date: after };
  }
  const response = await fetchWithTimeout(
    PARALLEL_URL,
    {
      method: "POST",
      redirect: "error",
      headers: { "x-api-key": ctx.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    },
    25_000,
    ctx.signal,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Parallel API key is invalid (HTTP ${response.status}) - set PARALLEL_API_KEY`);
    }
    if (response.status === 402) {
      throw new Error(`Parallel quota/billing error (HTTP 402) - check usage/credits at platform.parallel.ai. ${detail}`);
    }
    throw new Error(`Parallel API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; excerpts?: string[]; publish_date?: string }>;
  };
  return { sources: mapParallelResults(data.results, ctx.maxResults), truncated: false };
}

export async function searchParallelMCP(ctx: EngineCallContext): Promise<EngineResult> {
  const after = afterDate(ctx);
  const objective = after ? `${ctx.query} (prefer results published after ${after})` : ctx.query;
  const response = await fetchWithTimeout(
    PARALLEL_MCP_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "web_search",
          arguments: {
            objective,
            search_queries: [ctx.query],
            session_id: PARALLEL_MCP_SESSION,
          },
        },
      }),
    },
    25_000,
    ctx.signal,
  );
  if (!response.ok) throw new Error(`Parallel MCP error (HTTP ${response.status})`);
  const json = parseJsonOrSse(await response.text()) as {
    error?: { message?: string };
    result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  } | null;
  if (!json || json.error) throw new Error(`Parallel MCP error: ${json?.error?.message ?? "no data"}`);
  const blocks = (json.result?.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "");
  if (json.result?.isError) {
    throw new Error(`Parallel MCP error: ${blocks.join(" ").slice(0, 200) || "tool call failed"}`);
  }
  type ParallelPayload = { results?: Array<{ url?: string; title?: string; excerpts?: string[]; publish_date?: string }> };
  let payload: ParallelPayload | null = null;
  for (const block of blocks) {
    try {
      payload = JSON.parse(block) as ParallelPayload;
      break;
    } catch {
      // keep scanning
    }
  }
  return { sources: mapParallelResults(payload?.results, ctx.maxResults), truncated: false };
}

export async function searchParallel(ctx: EngineCallContext): Promise<EngineResult> {
  if (ctx.apiKey) return searchParallelREST(ctx);
  return searchParallelMCP(ctx);
}
