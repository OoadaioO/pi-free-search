import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isEngineId, type SafeSearch, type SearchConfig } from "./types.ts";

export const DEFAULT_CONFIG: SearchConfig = {
  provider: "bing",
  bingMarket: "zh-CN",
  safeSearch: "off",
  cache: true,
  cacheTtl: 5,
};

const BING_MARKETS = [
  "zh-CN",
  "zh-TW",
  "en-US",
  "en-GB",
  "ru-RU",
  "ja-JP",
  "de-DE",
  "fr-FR",
  "es-ES",
  "ko-KR",
] as const;

const SAFE_SEARCH: readonly SafeSearch[] = ["off", "moderate", "strict"];

export function defaultConfigPath(): string {
  return join(homedir(), ".pi", "agent", "web-search.json");
}

export function clampCacheTtl(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CONFIG.cacheTtl;
  return Math.min(Math.max(n, 0), 5);
}

export function normalizeConfig(raw: unknown): SearchConfig {
  const input = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const provider = typeof input.provider === "string" && isEngineId(input.provider) ? input.provider : DEFAULT_CONFIG.provider;
  const bingMarket =
    typeof input.bingMarket === "string" && (BING_MARKETS as readonly string[]).includes(input.bingMarket)
      ? input.bingMarket
      : DEFAULT_CONFIG.bingMarket;
  const safeSearch =
    typeof input.safeSearch === "string" && (SAFE_SEARCH as readonly string[]).includes(input.safeSearch)
      ? (input.safeSearch as SafeSearch)
      : DEFAULT_CONFIG.safeSearch;
  return {
    provider,
    bingMarket,
    safeSearch,
    cache: input.cache !== false,
    cacheTtl: clampCacheTtl(input.cacheTtl),
  };
}

export function loadConfig(filePath = defaultConfigPath()): SearchConfig {
  try {
    const text = readFileSync(filePath, "utf8");
    return normalizeConfig(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: SearchConfig, filePath = defaultConfigPath()): void {
  const normalized = normalizeConfig(config);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

