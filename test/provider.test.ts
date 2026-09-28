import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { buildEngineChain, createSearchProvider } from "../src/provider.ts";
import type { EngineCallContext, EngineId, EngineResult } from "../src/types.ts";

function mockRunners(map: Partial<Record<EngineId, () => Promise<EngineResult> | EngineResult>>) {
  const calls: EngineId[] = [];
  const runEngine = async (engine: EngineId, _ctx: EngineCallContext): Promise<EngineResult> => {
    calls.push(engine);
    const fn = map[engine];
    if (!fn) throw new Error(`unmocked ${engine}`);
    return await fn();
  };
  return { calls, runEngine };
}

const hit = (url: string): EngineResult => ({
  sources: [{ url, title: "ok" }],
  truncated: false,
});

describe("buildEngineChain", () => {
  it("puts preferred first, then paid, then free", () => {
    const chain = buildEngineChain("bing");
    assert.equal(chain[0], "bing");
    assert.ok(chain.indexOf("exa") < chain.indexOf("ddg"));
    assert.ok(!chain.slice(1).includes("bing"));
  });

  it("skips preferred when it cannot time-filter", () => {
    const chain = buildEngineChain("bing", { days: 7 });
    assert.ok(!chain.includes("bing") || chain[0] !== "bing");
    assert.equal(chain[0], "tavily");
    assert.ok(chain.includes("ddg"));
  });
});

describe("createSearchProvider", () => {
  it("falls back when preferred fails", async () => {
    const { calls, runEngine } = mockRunners({
      bing: async () => {
        throw new Error("boom");
      },
      anysearch: async () => hit("https://example.com"),
    });
    const provider = createSearchProvider({
      getConfig: () => DEFAULT_CONFIG,
      resolveApiKey: () => "",
      runEngine,
      onWarn: () => {},
    });
    const result = await provider.search({ query: "pi" });
    assert.equal(result.provider, "anysearch");
    assert.match(result.note ?? "", /Note: bing unavailable or failed \(boom\), using anysearch\./);
    assert.ok(calls.includes("bing"));
    assert.ok(calls.includes("anysearch"));
  });

  it("uses time-filter note when preferred cannot filter", async () => {
    const { calls, runEngine } = mockRunners({
      tavily: async () => hit("https://tavily.example"),
    });
    const provider = createSearchProvider({
      getConfig: () => DEFAULT_CONFIG,
      resolveApiKey: () => "",
      runEngine,
      onWarn: () => {},
    });
    const result = await provider.search({ query: "pi", timeRange: "week" });
    assert.equal(result.provider, "tavily");
    assert.match(result.note ?? "", /does not support time filtering \(timeRange=week\), using tavily\./);
    assert.ok(!calls.includes("bing"));
  });

  it("throws when every engine fails", async () => {
    const provider = createSearchProvider({
      getConfig: () => DEFAULT_CONFIG,
      resolveApiKey: () => "",
      runEngine: async () => {
        throw new Error("nope");
      },
      onWarn: () => {},
    });
    await assert.rejects(() => provider.search({ query: "pi" }), /nope/);
  });

  it("caches successful results", async () => {
    let n = 0;
    const provider = createSearchProvider({
      getConfig: () => DEFAULT_CONFIG,
      resolveApiKey: () => "",
      runEngine: async (engine) => {
        if (engine !== "bing") throw new Error("skip");
        n += 1;
        return hit("https://cached.example");
      },
      onWarn: () => {},
    });
    const first = await provider.search({ query: "cache-me" });
    const second = await provider.search({ query: "cache-me" });
    assert.equal(first.cache, "miss");
    assert.equal(second.cache, "hit");
    assert.equal(n, 1);
  });

  it("aborts when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const provider = createSearchProvider({
      getConfig: () => DEFAULT_CONFIG,
      resolveApiKey: () => "",
      runEngine: async () => {
        called = true;
        return hit("https://x.example");
      },
      onWarn: () => {},
    });
    await assert.rejects(() => provider.search({ query: "pi" }, controller.signal));
    assert.equal(called, false);
  });
});
