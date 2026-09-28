import { stripTags } from "./html.ts";
import { fetchWithTimeout, USER_AGENT } from "./http.ts";
import type { EngineResult, Source } from "./types.ts";

export const PLATFORMS = [
  "github",
  "v2ex",
  "bilibili",
  "reddit",
  "hn",
  "stackoverflow",
  "wikipedia",
  "npm",
] as const;

export type PlatformId = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<PlatformId, { label: string }> = {
  github: { label: "GitHub" },
  v2ex: { label: "V2EX" },
  bilibili: { label: "Bilibili" },
  reddit: { label: "Reddit" },
  hn: { label: "Hacker News" },
  stackoverflow: { label: "Stack Overflow" },
  wikipedia: { label: "Wikipedia" },
  npm: { label: "npm" },
};

export function isPlatformId(value: string): value is PlatformId {
  return (PLATFORMS as readonly string[]).includes(value);
}

function wikipediaHost(bingMarket: string): string {
  const lang = bingMarket.split("-")[0]?.toLowerCase() || "zh";
  return `${lang}.wikipedia.org`;
}

async function searchGithub(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${maxResults}`,
    { headers: { "user-agent": USER_AGENT, accept: "application/vnd.github+json" } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`GitHub API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    items?: Array<{ html_url?: string; full_name?: string; name?: string; description?: string; stargazers_count?: number }>;
  };
  return {
    sources: (data.items ?? [])
      .filter((item) => item.html_url)
      .map((item) => ({
        url: item.html_url as string,
        title: item.full_name ?? item.name,
        snippet: `${item.description ?? ""}${item.stargazers_count ? ` ⭐${item.stargazers_count}` : ""}`.trim(),
      })),
    truncated: false,
  };
}

async function searchV2ex(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    "https://www.v2ex.com/api/topics/hot.json",
    { headers: { "user-agent": USER_AGENT } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`V2EX API error (HTTP ${response.status})`);
  const topics = (await response.json()) as Array<{ id?: number; title?: string; content?: string }>;
  const q = query.toLowerCase();
  const matched = Array.isArray(topics)
    ? topics.filter(
        (topic) =>
          (topic.title ?? "").toLowerCase().includes(q) || (topic.content ?? "").toLowerCase().includes(q),
      )
    : [];
  return {
    sources: matched.slice(0, maxResults).map((topic) => ({
      url: `https://www.v2ex.com/t/${topic.id}`,
      title: topic.title,
      ...(topic.content ? { snippet: String(topic.content).slice(0, 200) } : {}),
    })),
    truncated: false,
  };
}

async function searchBilibili(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}`,
    { headers: { "user-agent": USER_AGENT, referer: "https://www.bilibili.com" } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`Bilibili API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    code?: number;
    message?: string;
    data?: { result?: Array<{ data?: Array<{ arcurl?: string; title?: string; bvid?: string; desc?: string }> }> };
  };
  if (data.code !== 0) throw new Error(`Bilibili API error: ${data.message ?? data.code}`);
  const sources: Source[] = [];
  for (const section of data.data?.result ?? []) {
    for (const item of section.data ?? []) {
      if (!item.arcurl) continue;
      sources.push({
        url: item.arcurl,
        title: item.title ? String(item.title).replace(/<[^>]+>/g, "") : item.bvid,
        ...(item.desc ? { snippet: String(item.desc).slice(0, 200) } : {}),
      });
      if (sources.length >= maxResults) break;
    }
    if (sources.length >= maxResults) break;
  }
  return { sources, truncated: false };
}

async function searchReddit(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    `https://old.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${maxResults}&sort=relevance`,
    {
      headers: {
        "user-agent": `${USER_AGENT} (pi-free-search)`,
        accept: "application/json",
      },
    },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`Reddit API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    data?: { children?: Array<{ data?: { url?: string; title?: string; selftext?: string } }> };
  };
  return {
    sources: (data.data?.children ?? [])
      .map((child) => child.data)
      .filter((post): post is { url: string; title?: string; selftext?: string } => Boolean(post?.url))
      .map((post) => ({
        url: post.url,
        title: post.title ?? "",
        ...(post.selftext ? { snippet: String(post.selftext).slice(0, 200) } : {}),
      })),
    truncated: false,
  };
}

async function searchHackerNews(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${maxResults}`,
    { headers: { "user-agent": USER_AGENT, accept: "application/json" } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`Hacker News API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    hits?: Array<{
      url?: string;
      title?: string;
      story_title?: string;
      objectID?: string;
      points?: number;
      num_comments?: number;
    }>;
  };
  return {
    sources: (data.hits ?? [])
      .filter((hit) => hit.title || hit.story_title)
      .map((hit) => ({
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: hit.title ?? hit.story_title,
        ...((hit.points !== undefined && hit.points !== null) || (hit.num_comments !== undefined && hit.num_comments !== null)
          ? { snippet: `HN discussion · ${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments` }
          : {}),
      })),
    truncated: false,
  };
}

async function searchStackOverflow(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${maxResults}&filter=!nNPvSNVZJS`,
    { headers: { "user-agent": USER_AGENT, accept: "application/json" } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`Stack Exchange API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    error_message?: string;
    items?: Array<{ link?: string; title?: string; score?: number; answer_count?: number; is_answered?: boolean }>;
  };
  if (data.error_message) throw new Error(`Stack Exchange API error: ${data.error_message}`);
  return {
    sources: (data.items ?? [])
      .filter((item) => item.link)
      .map((item) => ({
        url: item.link as string,
        title: item.title,
        ...(item.score !== undefined || item.answer_count !== undefined
          ? {
              snippet: `${item.is_answered ? "✓ answered" : "unanswered"} · score ${item.score ?? 0} · ${item.answer_count ?? 0} answers`,
            }
          : {}),
      })),
    truncated: false,
  };
}

async function searchWikipedia(
  query: string,
  maxResults: number,
  signal: AbortSignal | undefined,
  bingMarket: string,
): Promise<EngineResult> {
  const host = wikipediaHost(bingMarket);
  const response = await fetchWithTimeout(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults}`,
    { headers: { "user-agent": USER_AGENT, accept: "application/json" } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`Wikipedia API error (HTTP ${response.status})`);
  const data = (await response.json()) as { query?: { search?: Array<{ title?: string; snippet?: string }> } };
  return {
    sources: (data.query?.search ?? []).map((row) => ({
      url: `https://${host}/wiki/${encodeURIComponent(String(row.title ?? "").replace(/ /g, "_"))}`,
      title: row.title,
      ...(row.snippet ? { snippet: stripTags(row.snippet).slice(0, 200) } : {}),
    })),
    truncated: false,
  };
}

async function searchNpm(query: string, maxResults: number, signal?: AbortSignal): Promise<EngineResult> {
  const response = await fetchWithTimeout(
    `https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(query)}&size=${maxResults}`,
    { headers: { "user-agent": USER_AGENT, accept: "application/json" } },
    12_000,
    signal,
  );
  if (!response.ok) throw new Error(`npm registry API error (HTTP ${response.status})`);
  const data = (await response.json()) as {
    objects?: Array<{ package?: { name?: string; version?: string; description?: string; links?: { npm?: string } } }>;
  };
  return {
    sources: (data.objects ?? [])
      .map((row) => row.package)
      .filter((pkg): pkg is NonNullable<typeof pkg> & { name: string } => Boolean(pkg?.name))
      .map((pkg) => ({
        url: pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
        title: pkg.name,
        ...((pkg.description || pkg.version)
          ? { snippet: `v${pkg.version ?? "?"}${pkg.description ? ` — ${String(pkg.description).slice(0, 160)}` : ""}` }
          : {}),
      })),
    truncated: false,
  };
}

export async function searchPlatform(
  platform: string,
  query: string,
  maxResults: number,
  signal?: AbortSignal,
  bingMarket = "zh-CN",
): Promise<EngineResult> {
  if (!query.trim()) throw new Error("query is required");
  const limit = Math.min(Math.max(maxResults, 1), 10);
  switch (platform) {
    case "github":
      return searchGithub(query, limit, signal);
    case "v2ex":
      return searchV2ex(query, limit, signal);
    case "bilibili":
      return searchBilibili(query, limit, signal);
    case "reddit":
      return searchReddit(query, limit, signal);
    case "hn":
      return searchHackerNews(query, limit, signal);
    case "stackoverflow":
      return searchStackOverflow(query, limit, signal);
    case "wikipedia":
      return searchWikipedia(query, limit, signal, bingMarket);
    case "npm":
      return searchNpm(query, limit, signal);
    default:
      throw new Error(`unknown platform "${platform}" - use one of: ${PLATFORMS.join(", ")}`);
  }
}

export { wikipediaHost };
