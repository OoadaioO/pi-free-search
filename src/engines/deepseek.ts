import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, readErrorBody } from "../http.ts";
import type { EngineCallContext, EngineResult, Source } from "../types.ts";

export async function searchDeepSeekOfficial(ctx: EngineCallContext): Promise<EngineResult> {
  if (!ctx.apiKey) throw new Error("DeepSeek search requires DEEPSEEK_API_KEY");
  const timeout = AbortSignal.timeout(20_000);
  const combined = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  const response = await fetchWithTimeout(
    "https://api.deepseek.com/anthropic/v1/messages",
    {
      method: "POST",
      redirect: "error",
      headers: {
        "x-api-key": ctx.apiKey,
        authorization: `Bearer ${ctx.apiKey}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "pi-free-search/web-search",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `Perform a web search for the query: ${ctx.query}` }],
          },
        ],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
      }),
    },
    20_000,
    combined,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401) throw new Error("DeepSeek API key is invalid (HTTP 401) - set DEEPSEEK_API_KEY");
    throw new Error(`DeepSeek API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    content?: Array<{
      type?: string;
      citations?: Array<{ url?: string; cited_text?: string }>;
      content?: Array<{ type?: string; url?: string; title?: string; page_age?: string }>;
    }>;
  };
  const blocks = data.content ?? [];
  const snippets = new Map<string, string>();
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const cite of block.citations ?? []) {
      if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
    }
  }
  const sources: Source[] = [];
  for (const block of blocks.filter((item) => item.type === "web_search_tool_result")) {
    for (const item of block.content ?? []) {
      if (item.type !== "web_search_result" || !item.url) continue;
      if (sources.some((source) => source.url === item.url)) continue;
      sources.push({
        url: item.url,
        ...(item.title ? { title: item.title } : {}),
        ...(snippets.get(item.url) ? { snippet: snippets.get(item.url) } : {}),
        ...(item.page_age ? { publishedAt: item.page_age } : {}),
      });
    }
  }
  return { sources: uniqueSources(sources, ctx.maxResults), truncated: false };
}
