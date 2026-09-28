import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchPlatform, wikipediaHost } from "../src/platforms.ts";

describe("wikipediaHost", () => {
  it("uses the language prefix of bingMarket", () => {
    assert.equal(wikipediaHost("zh-CN"), "zh.wikipedia.org");
    assert.equal(wikipediaHost("en-US"), "en.wikipedia.org");
    assert.equal(wikipediaHost("ja-JP"), "ja.wikipedia.org");
  });
});

describe("searchPlatform", () => {
  it("rejects unknown platforms", async () => {
    await assert.rejects(() => searchPlatform("myspace", "pi", 5), /unknown platform/);
  });

  it("rejects empty query", async () => {
    await assert.rejects(() => searchPlatform("github", "   ", 5), /query is required/);
  });
});
