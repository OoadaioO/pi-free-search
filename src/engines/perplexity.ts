import { uniqueSources } from "../html.ts";
import { fetchWithTimeout, readErrorBody } from "../http.ts";
import type { EngineCallContext, EngineResult } from "../types.ts";

export async function searchPerplexity(ctx: EngineCallContext): Promise<EngineResult> {
  if (!ctx.apiKey) throw new Error("Perplexity search requires PERPLEXITY_API_KEY");
  const timeout = AbortSignal.timeout(20_000);
  const combined = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  const response = await fetchWithTimeout(
    "https://api.perplexity.ai/chat/completions",
    {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${ctx.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        max_tokens: 1024,
        messages: [{ role: "user", content: ctx.query }],
      }),
    },
    20_000,
    combined,
  );
  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status === 401) throw new Error("Perplexity API key is invalid (HTTP 401) - set PERPLEXITY_API_KEY");
    throw new Error(`Perplexity API error (HTTP ${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
  };
  const answer = data.choices?.[0]?.message?.content ?? "";
  const sources = (data.citations ?? []).map((url) => ({
    url,
    ...(answer ? { snippet: answer.slice(0, 200) } : {}),
  }));
  return {
    content: answer,
    sources: uniqueSources(sources, ctx.maxResults),
    truncated: false,
  };
}
