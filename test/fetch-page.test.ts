import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertFetchUrl, htmlToText, truncateText } from "../src/fetch-page.ts";

describe("assertFetchUrl", () => {
  it("accepts http and https", () => {
    assert.equal(assertFetchUrl("https://example.com/x").hostname, "example.com");
    assert.equal(assertFetchUrl("http://example.com").protocol, "http:");
  });

  it("rejects non-http protocols and invalid urls", () => {
    assert.throws(() => assertFetchUrl("file:///etc/passwd"), /only http/);
    assert.throws(() => assertFetchUrl("not a url"), /invalid url/);
    assert.throws(() => assertFetchUrl("  "), /url is required/);
  });
});

describe("htmlToText", () => {
  it("extracts title and strips scripts", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Hello &amp; Co</title></head><body><script>alert(1)</script><p>One</p><p>Two</p></body></html>",
    );
    assert.equal(title, "Hello & Co");
    assert.match(text, /One/);
    assert.match(text, /Two/);
    assert.equal(text.includes("alert"), false);
  });
});

describe("truncateText", () => {
  it("truncates long text", () => {
    const { truncated } = truncateText("x".repeat(60_000));
    assert.equal(truncated, true);
  });
});
