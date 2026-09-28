export const ALL_ENGINES = [
  "ddg",
  "ddg-lite",
  "bing",
  "searxng",
  "anysearch",
  "exa",
  "tavily",
  "keenable",
  "firecrawl",
  "parallel",
  "perplexity",
  "serpbase",
  "deepseek-official",
] as const;

export type EngineId = (typeof ALL_ENGINES)[number];

export const FREE_ENGINES = ["bing", "anysearch", "ddg", "ddg-lite", "searxng"] as const;
export const PAID_ENGINES = [
  "exa",
  "tavily",
  "keenable",
  "firecrawl",
  "parallel",
  "perplexity",
  "serpbase",
  "deepseek-official",
] as const;
export const TIME_ENGINES = [
  "tavily",
  "exa",
  "keenable",
  "firecrawl",
  "parallel",
  "searxng",
  "ddg",
  "ddg-lite",
] as const;
export const KEY_REQUIRED_ENGINES = ["perplexity", "serpbase", "deepseek-official"] as const;

export const ENGINE_KEY_ENV: Partial<Record<EngineId, string>> = {
  anysearch: "ANYSEARCH_API_KEY",
  exa: "EXA_API_KEY",
  tavily: "TAVILY_API_KEY",
  keenable: "KEENABLE_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
  parallel: "PARALLEL_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  serpbase: "SERPBASE_API_KEY",
  "deepseek-official": "DEEPSEEK_API_KEY",
};

export const ENGINE_META: Record<EngineId, { label: string; badge: "FREE" | "API KEY" }> = {
  ddg: { label: "DuckDuckGo HTML", badge: "FREE" },
  "ddg-lite": { label: "DuckDuckGo Lite", badge: "FREE" },
  bing: { label: "Bing", badge: "FREE" },
  searxng: { label: "SearXNG", badge: "FREE" },
  anysearch: { label: "AnySearch AI", badge: "FREE" },
  exa: { label: "Exa", badge: "FREE" },
  tavily: { label: "Tavily", badge: "FREE" },
  keenable: { label: "Keenable", badge: "FREE" },
  firecrawl: { label: "Firecrawl", badge: "FREE" },
  parallel: { label: "Parallel", badge: "FREE" },
  perplexity: { label: "Perplexity", badge: "API KEY" },
  serpbase: { label: "SerpBase Google", badge: "API KEY" },
  "deepseek-official": { label: "DeepSeek Official", badge: "API KEY" },
};

export type SafeSearch = "off" | "moderate" | "strict";

export type TimeRange = { days: number } | { after: string };

export type Source = {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
};

export type EngineResult = {
  sources: Source[];
  truncated?: boolean;
  content?: string;
};

export type SearchRequest = {
  query: string;
  maxResults?: number;
  timeRange?: string;
  engine?: string;
};

export type SearchResult = {
  provider: string;
  sources: Source[];
  content: string;
  note?: string;
  cache?: "hit" | "miss";
  truncated?: boolean;
};

export type SearchConfig = {
  provider: EngineId;
  bingMarket: string;
  safeSearch: SafeSearch;
  cache: boolean;
  cacheTtl: number;
};

export type EngineCallContext = {
  query: string;
  maxResults: number;
  timeRange?: TimeRange;
  bingMarket: string;
  safeSearch: SafeSearch;
  apiKey: string;
  signal?: AbortSignal;
};

export function isEngineId(value: string): value is EngineId {
  return (ALL_ENGINES as readonly string[]).includes(value);
}

export function isKeyRequired(engine: EngineId): boolean {
  return (KEY_REQUIRED_ENGINES as readonly string[]).includes(engine);
}

export function supportsTimeFilter(engine: EngineId): boolean {
  return (TIME_ENGINES as readonly string[]).includes(engine);
}
