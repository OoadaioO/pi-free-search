import type { SearchResult } from "./types.ts";

export const CACHE_MAX_ENTRIES = 50;

export function buildCacheKey(
  query: string,
  maxResults: number,
  timeRangeLabel: string,
  preferred: string,
): string {
  return [query, maxResults, timeRangeLabel, preferred].join("\u0000");
}

export class SearchCache {
  private readonly map = new Map<string, { value: SearchResult; expiresAt: number }>();

  constructor(private readonly maxEntries = CACHE_MAX_ENTRIES) {}

  get(key: string, now = Date.now()): SearchResult | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return { ...hit.value, sources: hit.value.sources.slice() };
  }

  set(key: string, value: SearchResult, ttlMs: number, now = Date.now()): void {
    this.map.set(key, { value, expiresAt: now + ttlMs });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
