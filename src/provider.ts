import { buildCacheKey, SearchCache } from "./cache.ts";
import { runEngine as defaultRunEngine } from "./engines/index.ts";
import { cleanSnippet } from "./html.ts";
import { parseTimeRange, timeRangeLabel, type TimeRange } from "./time-range.ts";
import {
  ENGINE_KEY_ENV,
  FREE_ENGINES,
  PAID_ENGINES,
  isEngineId,
  isKeyRequired,
  supportsTimeFilter,
  type EngineCallContext,
  type EngineId,
  type EngineResult,
  type SearchConfig,
  type SearchRequest,
  type SearchResult,
} from "./types.ts";

const BUDGET_MS = 30_000;

export type RunEngineFn = (engine: EngineId, ctx: EngineCallContext) => Promise<EngineResult>;

export type SearchProviderOptions = {
  getConfig: () => SearchConfig;
  resolveApiKey?: (envName: string) => string;
  runEngine?: RunEngineFn;
  cache?: SearchCache;
  now?: () => number;
  onWarn?: (message: string) => void;
};

export type SearchProvider = {
  search: (request: SearchRequest, signal?: AbortSignal) => Promise<SearchResult>;
  testEngine: (
    engine: string,
    options?: { query?: string; timeRange?: string; signal?: AbortSignal; retry?: boolean },
  ) => Promise<EngineTestResult>;
};

export type EngineTestResult =
  | { ok: true; engine: EngineId; sources: EngineResult["sources"]; content?: string }
  | { ok: false; engine: string; error: string };

export function buildEngineChain(preferred: EngineId, timeRange?: TimeRange): EngineId[] {
  if (timeRange) {
    const preferredFirst = [preferred].filter((engine) => supportsTimeFilter(engine));
    const otherTime = (["tavily", "exa", "keenable", "firecrawl", "parallel", "searxng", "ddg", "ddg-lite"] as EngineId[]).filter(
      (engine) => engine !== preferred,
    );
    const noTime = [...PAID_ENGINES, ...FREE_ENGINES].filter(
      (engine) => !supportsTimeFilter(engine) && engine !== preferred,
    );
    return [...preferredFirst, ...otherTime, ...noTime];
  }
  const othersPaid = PAID_ENGINES.filter((engine) => engine !== preferred);
  const othersFree = FREE_ENGINES.filter((engine) => engine !== preferred);
  return [preferred, ...othersPaid, ...othersFree];
}

function clampMaxResults(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(Math.max(Math.trunc(n), 1), 10);
}

export function createSearchProvider(options: SearchProviderOptions): SearchProvider {
  const cache = options.cache ?? new SearchCache();
  const runEngine = options.runEngine ?? defaultRunEngine;
  const resolveApiKey = options.resolveApiKey ?? ((envName: string) => process.env[envName] ?? "");
  const now = options.now ?? Date.now;
  const warn = options.onWarn ?? ((message: string) => console.warn(message));

  const makeCtx = (
    request: { query: string; maxResults: number; timeRange?: TimeRange },
    cfg: SearchConfig,
    engine: EngineId,
    signal?: AbortSignal,
  ): EngineCallContext => ({
    query: request.query,
    maxResults: request.maxResults,
    timeRange: request.timeRange,
    bingMarket: cfg.bingMarket,
    safeSearch: cfg.safeSearch,
    apiKey: (() => {
      const envName = ENGINE_KEY_ENV[engine];
      return envName ? resolveApiKey(envName).trim() : "";
    })(),
    signal,
  });

  return {
    async search(request, signal) {
      if (request === null || typeof request !== "object" || typeof request.query !== "string" || !request.query.trim()) {
        throw new Error("query is required");
      }
      if (signal?.aborted) throw new Error("search aborted");
      const cfg = options.getConfig();
      const preferred =
        typeof request.engine === "string" && isEngineId(request.engine) ? request.engine : cfg.provider;
      const timeRange = parseTimeRange(request.timeRange);
      const label = timeRangeLabel(request.timeRange, timeRange);
      const maxResults = clampMaxResults(request.maxResults);

      const cacheTtlMs = cfg.cacheTtl * 60 * 1000;
      const cacheEnabled = cfg.cache !== false && cacheTtlMs > 0;
      const cacheKey = cacheEnabled ? buildCacheKey(request.query, maxResults, label, preferred) : null;
      if (cacheKey) {
        const hit = cache.get(cacheKey, now());
        if (hit) {
          if (signal?.aborted) throw new Error("search aborted");
          return { ...hit, cache: "hit" };
        }
      }

      const chain = buildEngineChain(preferred, timeRange);
      let preferredSkippedReason: "time-filter" | null = timeRange && !supportsTimeFilter(preferred) ? "time-filter" : null;
      let preferredFailure: string | null = null;
      let lastError: unknown = null;
      const deadline = now() + BUDGET_MS;

      for (const engine of chain) {
        const remaining = deadline - now();
        if (remaining <= 0) throw new Error(`search timed out after ${BUDGET_MS / 1000}s`);
        const effSignal = AbortSignal.any([
          AbortSignal.timeout(remaining),
          ...(signal !== undefined ? [signal] : []),
        ]);
        const ctx = makeCtx({ query: request.query.trim(), maxResults, timeRange }, cfg, engine, effSignal);
        if (isKeyRequired(engine) && !ctx.apiKey) {
          lastError = new Error(`${engine} requires ${ENGINE_KEY_ENV[engine]}`);
          if (engine === preferred) preferredFailure = `${ENGINE_KEY_ENV[engine]} is not configured`;
          warn(`web-search: engine "${engine}" skipped (no key), trying next engine`);
          continue;
        }
        try {
          const result = await runEngine(engine, ctx);
          if (result.sources.length > 0) {
            const sources = result.sources.map((source) =>
              source.snippet ? { ...source, snippet: cleanSnippet(source.snippet) ?? source.snippet } : source,
            );
            let note: string | undefined;
            if (engine !== preferred) {
              if (preferredSkippedReason === "time-filter") {
                note = `Note: ${preferred} does not support time filtering (timeRange=${label}), using ${engine}.`;
              } else if (preferredFailure) {
                note = `Note: ${preferred} unavailable or failed (${preferredFailure}), using ${engine}.`;
              } else {
                note = `Note: ${preferred} unavailable or failed, using ${engine}.`;
              }
            }
            const cached: SearchResult = {
              provider: engine,
              sources,
              content: result.content ?? "",
              note,
              truncated: result.truncated ?? false,
            };
            if (cacheKey) {
              const entryTtlMs = engine !== preferred ? Math.max(cacheTtlMs / 5, 1000) : cacheTtlMs;
              cache.set(cacheKey, cached, entryTtlMs, now());
            }
            return { ...cached, cache: "miss" };
          }
          lastError = new Error(`engine "${engine}" returned 0 results`);
          if (engine === preferred) preferredFailure = "returned 0 results";
          warn(`web-search: ${engine} returned 0 results, trying next engine`);
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (engine === preferred) preferredFailure = message;
          warn(`web-search: engine "${engine}" failed (${message}), trying next engine`);
        }
      }
      throw lastError instanceof Error ? lastError : new Error("all search engines failed");
    },

    async testEngine(engine, testOptions) {
      if (!isEngineId(engine)) return { ok: false, engine, error: `unknown engine: ${engine}` };
      const cfg = options.getConfig();
      const query = testOptions?.query?.trim() || "DeepSeek Harness";
      const parsed = parseTimeRange(testOptions?.timeRange);
      const ctx = makeCtx({ query, maxResults: 2, timeRange: parsed }, cfg, engine, testOptions?.signal);
      if (isKeyRequired(engine) && !ctx.apiKey) {
        return { ok: false, engine, error: `${ENGINE_KEY_ENV[engine]} not configured` };
      }
      const attempt = () => runEngine(engine, ctx);
      try {
        let result = await attempt();
        if (result.sources.length === 0 && testOptions?.retry !== false) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          result = await attempt();
        }
        return {
          ok: true,
          engine,
          sources: result.sources.map((source) =>
            source.snippet ? { ...source, snippet: cleanSnippet(source.snippet) ?? source.snippet } : source,
          ),
          ...(result.content ? { content: result.content } : {}),
        };
      } catch (error) {
        return { ok: false, engine, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
