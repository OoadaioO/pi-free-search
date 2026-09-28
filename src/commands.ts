import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { ALL_ENGINES, ENGINE_META, isEngineId, type SearchConfig } from "./types.ts";
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
      const result = await options.provider.testEngine(engine, "DeepSeek Harness");
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
}
