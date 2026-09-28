import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approximateTimeRange, parseTimeRange } from "../src/time-range.ts";

describe("parseTimeRange", () => {
  it("parses fixed tiers", () => {
    assert.deepEqual(parseTimeRange("day"), { days: 1 });
    assert.deepEqual(parseTimeRange("week"), { days: 7 });
    assert.deepEqual(parseTimeRange("month"), { days: 30 });
    assert.deepEqual(parseTimeRange("year"), { days: 365 });
  });

  it("parses relative values", () => {
    assert.deepEqual(parseTimeRange("12h"), { days: 0.5 });
    assert.deepEqual(parseTimeRange("3d"), { days: 3 });
    assert.deepEqual(parseTimeRange("2mo"), { days: 60 });
    assert.deepEqual(parseTimeRange("1y"), { days: 365 });
  });

  it("parses absolute dates", () => {
    assert.deepEqual(parseTimeRange("2026-07-01"), { after: "2026-07-01" });
  });

  it("passes through already parsed objects", () => {
    assert.deepEqual(parseTimeRange({ days: 4 }), { days: 4 });
    assert.deepEqual(parseTimeRange({ after: "2026-01-02" }), { after: "2026-01-02" });
  });

  it("returns undefined for invalid input", () => {
    assert.equal(parseTimeRange(undefined), undefined);
    assert.equal(parseTimeRange(""), undefined);
    assert.equal(parseTimeRange("nope"), undefined);
    assert.equal(parseTimeRange({ days: -1 }), undefined);
    assert.equal(parseTimeRange({ after: "07-01-2026" }), undefined);
  });
});

describe("approximateTimeRange", () => {
  it("maps day boundaries", () => {
    assert.equal(approximateTimeRange(1), "day");
    assert.equal(approximateTimeRange(2), "day");
    assert.equal(approximateTimeRange(2.1), "week");
  });

  it("maps week/month/year boundaries", () => {
    assert.equal(approximateTimeRange(14), "week");
    assert.equal(approximateTimeRange(14.1), "month");
    assert.equal(approximateTimeRange(90), "month");
    assert.equal(approximateTimeRange(90.1), "year");
  });
});
