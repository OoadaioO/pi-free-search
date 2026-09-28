import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { BING_MARKETS, SAFE_SEARCH } from "./config.ts";
import { ALL_ENGINES, ENGINE_META, isEngineId, type SafeSearch, type SearchConfig } from "./types.ts";
import type { SearchProvider } from "./provider.ts";

function engineOptions(): string[] {
  return ALL_ENGINES.map((id) => {
    const meta = ENGINE_META[id];
    return `${id}  (${meta.badge}) ${meta.label}`;
  });
}

function completions(prefix: string): AutocompleteItem[] {
  const p = prefix.trim().toLowerCase();
  return ALL_ENGINES.filter((id) => id.startsWith(p) || ENGINE_META[id].label.toLowerCase().includes(p)).map((id) => ({
    value: id,
    label: id,
    description: `${ENGINE_META[id].badge} · ${ENGINE_META[id].label}`,
  }));
}

export function registerSearchCommands(
  pi: ExtensionAPI,
  options: {
    getConfig: () => SearchConfig;
    save: (config: SearchConfig) => void;
    provider: SearchProvider;
  },
): void {
  pi.registerCommand("search-engine", {
    description: "Choose the preferred web search engine",
    getArgumentCompletions: (prefix) => {
      const items = completions(prefix);
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const current = options.getConfig();
      const arg = args.trim();
      let selected = arg && isEngineId(arg) ? arg : undefined;
      if (!selected) {
        const choice = await ctx.ui.select(`Search engine (current: ${current.provider})`, engineOptions());
        const id = choice?.split(/\s+/)[0];
        if (!id || !isEngineId(id)) return;
        selected = id;
      }
      try {
        options.save({ ...current, provider: selected });
        ctx.ui.notify(`Search engine: ${selected} (${ENGINE_META[selected].badge})`, "info");
      } catch (error) {
        ctx.ui.notify(`Failed to save search engine: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("search-test", {
    description: "Test a search engine directly (no fallback)",
    getArgumentCompletions: (prefix) => {
      const items = completions(prefix);
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const current = options.getConfig();
      const engine = args.trim() && isEngineId(args.trim()) ? args.trim() : current.provider;
      ctx.ui.notify(`Testing ${engine}…`, "info");
      const result = await options.provider.testEngine(engine, { query: "DeepSeek Harness" });
      if (result.ok) {
        const sample = result.sources[0]?.title ?? result.sources[0]?.url ?? "";
        ctx.ui.notify(
          `✓ ${result.engine}: ${result.sources.length} results${sample ? ` · ${sample.slice(0, 40)}` : ""}`,
          "info",
        );
      } else {
        ctx.ui.notify(`✗ ${result.engine}: ${result.error}`, "error");
      }
    },
  });

  pi.registerCommand("search-config", {
    description: "Set Bing market, safe search, or cache TTL",
    getArgumentCompletions: (prefix) => {
      const items = configCompletions(prefix);
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const current = options.getConfig();
      const parsed = parseConfigArgs(args);
      if (parsed.error) {
        ctx.ui.notify(parsed.error, "error");
        return;
      }
      let next = { ...current };
      let key = parsed.key;
      if (!key) {
        const field = await ctx.ui.select(
          `Search config  engine=${current.provider}  market=${current.bingMarket}  safe=${current.safeSearch}  ttl=${current.cacheTtl}m`,
          [
            `bingMarket  (current: ${current.bingMarket})`,
            `safeSearch  (current: ${current.safeSearch})`,
            `cacheTtl  (current: ${current.cacheTtl})`,
          ],
        );
        const picked = field?.split(/\s+/)[0];
        if (picked !== "bingMarket" && picked !== "safeSearch" && picked !== "cacheTtl") return;
        key = picked;
      }
      if (parsed.value) {
        next = applyConfigValue(next, key, parsed.value);
      } else {
        const updated = await pickConfigValue(ctx, key, next);
        if (!updated) return;
        next = updated;
      }
      try {
        options.save(next);
        const saved = options.getConfig();
        ctx.ui.notify(
          `Search config: engine=${saved.provider} market=${saved.bingMarket} safe=${saved.safeSearch} ttl=${saved.cacheTtl}m`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(`Failed to save search config: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}

function isSafeSearch(value: string): value is SafeSearch {
  return (SAFE_SEARCH as readonly string[]).includes(value);
}

function applyConfigValue(config: SearchConfig, key: "bingMarket" | "safeSearch" | "cacheTtl", value: string): SearchConfig {
  const next = { ...config };
  if (key === "bingMarket") next.bingMarket = value;
  else if (key === "safeSearch" && isSafeSearch(value)) next.safeSearch = value;
  else if (key === "cacheTtl") {
    next.cacheTtl = Number(value);
    next.cache = next.cacheTtl > 0;
  }
  return next;
}

async function pickConfigValue(
  ctx: { ui: { select: (title: string, options: string[]) => Promise<string | undefined> } },
  key: "bingMarket" | "safeSearch" | "cacheTtl",
  current: SearchConfig,
): Promise<SearchConfig | undefined> {
  if (key === "bingMarket") {
    const choice = await ctx.ui.select("Bing market", [...BING_MARKETS]);
    if (!choice) return undefined;
    return applyConfigValue(current, key, choice);
  }
  if (key === "safeSearch") {
    const choice = await ctx.ui.select("Safe search", [...SAFE_SEARCH]);
    if (!choice) return undefined;
    return applyConfigValue(current, key, choice);
  }
  const choice = await ctx.ui.select("Cache TTL (minutes, 0=off)", ["0", "1", "2", "3", "4", "5"]);
  if (!choice) return undefined;
  return applyConfigValue(current, key, choice);
}

function parseConfigArgs(args: string): { key?: "bingMarket" | "safeSearch" | "cacheTtl"; value?: string; error?: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const key = parts[0];
  const value = parts.slice(1).join(" ");
  if (key !== "bingMarket" && key !== "safeSearch" && key !== "cacheTtl") {
    return { error: "usage: /search-config [bingMarket|safeSearch|cacheTtl] [value]" };
  }
  if (!value) return { key };
  if (key === "bingMarket" && !(BING_MARKETS as readonly string[]).includes(value)) {
    return { error: `unknown bingMarket "${value}"` };
  }
  if (key === "safeSearch" && !isSafeSearch(value)) {
    return { error: `unknown safeSearch "${value}"` };
  }
  if (key === "cacheTtl" && !/^[0-5]$/.test(value)) {
    return { error: "cacheTtl must be 0-5 minutes" };
  }
  return { key, value };
}

function configCompletions(prefix: string): AutocompleteItem[] {
  const trimmed = prefix.trimStart();
  const space = trimmed.indexOf(" ");
  const keys = [
    { value: "bingMarket", description: "Bing mkt + Accept-Language" },
    { value: "safeSearch", description: "off | moderate | strict" },
    { value: "cacheTtl", description: "0-5 minutes" },
  ];
  if (space < 0) {
    const p = trimmed.toLowerCase();
    return keys.filter((item) => item.value.startsWith(p)).map((item) => ({ value: item.value, label: item.value, description: item.description }));
  }
  const key = trimmed.slice(0, space);
  const rest = trimmed.slice(space + 1).trim().toLowerCase();
  if (key === "bingMarket") {
    return [...BING_MARKETS]
      .filter((item) => item.toLowerCase().startsWith(rest))
      .map((item) => ({ value: `${key} ${item}`, label: item }));
  }
  if (key === "safeSearch") {
    return [...SAFE_SEARCH]
      .filter((item) => item.startsWith(rest))
      .map((item) => ({ value: `${key} ${item}`, label: item }));
  }
  if (key === "cacheTtl") {
    return ["0", "1", "2", "3", "4", "5"]
      .filter((item) => item.startsWith(rest))
      .map((item) => ({ value: `${key} ${item}`, label: `${item} min` }));
  }
  return [];
}
