import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, loadConfig, normalizeConfig, saveConfig } from "../src/config.ts";

describe("normalizeConfig", () => {
  it("uses defaults for empty input", () => {
    assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
  });

  it("falls back invalid provider to bing", () => {
    assert.equal(normalizeConfig({ provider: "nope" }).provider, "bing");
    assert.equal(normalizeConfig({ provider: "exa" }).provider, "exa");
  });

  it("clamps cacheTtl to 0-5", () => {
    assert.equal(normalizeConfig({ cacheTtl: -2 }).cacheTtl, 0);
    assert.equal(normalizeConfig({ cacheTtl: 9 }).cacheTtl, 5);
    assert.equal(normalizeConfig({ cacheTtl: 3 }).cacheTtl, 3);
  });
});

describe("loadConfig / saveConfig", () => {
  it("returns defaults when the file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-web-search-"));
    try {
      assert.deepEqual(loadConfig(join(dir, "missing.json")), DEFAULT_CONFIG);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a saved config", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-web-search-"));
    const file = join(dir, "web-search.json");
    try {
      saveConfig({ ...DEFAULT_CONFIG, provider: "ddg", cacheTtl: 2 }, file);
      const loaded = loadConfig(file);
      assert.equal(loaded.provider, "ddg");
      assert.equal(loaded.cacheTtl, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
