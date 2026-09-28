import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchBing } from "../../src/engines/bing.ts";
import { fetchPage } from "../../src/fetch-page.ts";
import { searchPlatform } from "../../src/platforms.ts";

const skip = process.env.PI_OFFLINE === "1" || process.env.PI_SKIP_SMOKE === "1";

describe("network smoke", { skip }, () => {
  it("Bing returns http results", { timeout: 30_000 }, async () => {
    const result = await searchBing({
      query: "OpenAI",
      maxResults: 3,
      bingMarket: "en-US",
      safeSearch: "off",
      apiKey: "",
    });
    assert.ok(result.sources.length > 0, "Bing returned 0 sources");
    assert.match(result.sources[0]?.url ?? "", /^https?:\/\//);
  });

  it("web_fetch example.com extracts text", { timeout: 20_000 }, async () => {
    const page = await fetchPage("https://example.com");
    assert.equal(page.status, 200);
    assert.match(page.text, /example/i);
  });

  it("npm platform search returns packages", { timeout: 20_000 }, async () => {
    const result = await searchPlatform("npm", "react", 2);
    assert.ok(result.sources.length > 0, "npm returned 0 sources");
    assert.match(result.sources[0]?.url ?? "", /npmjs\.com/);
  });
});
