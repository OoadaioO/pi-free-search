export type TimeRange = { days: number } | { after: string };

const TIME_RANGES = ["day", "week", "month", "year"] as const;
const DAYS_BY_RANGE = { day: 1, week: 7, month: 30, year: 365 };

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function parseTimeRange(input: unknown): TimeRange | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "object") {
    const value = input as { after?: unknown; days?: unknown };
    if (typeof value.after === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.after)) {
      return { after: value.after };
    }
    if (typeof value.days === "number" && Number.isFinite(value.days) && value.days > 0) {
      return { days: value.days };
    }
    return undefined;
  }
  const s = String(input).trim().toLowerCase();
  if (s.length === 0) return undefined;
  if ((TIME_RANGES as readonly string[]).includes(s)) {
    return { days: DAYS_BY_RANGE[s as keyof typeof DAYS_BY_RANGE] };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { after: s };
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)$/);
  if (match) {
    const n = parseFloat(match[1] ?? "0");
    const unit = (match[2] ?? "d")[0];
    const days =
      unit === "h" ? n / 24 : unit === "d" ? n : unit === "w" ? n * 7 : unit === "m" ? n * 30 : n * 365;
    return { days };
  }
  return undefined;
}

export function approximateTimeRange(days: number): "day" | "week" | "month" | "year" {
  if (days <= 2) return "day";
  if (days <= 14) return "week";
  if (days <= 90) return "month";
  return "year";
}

export function timeRangeLabel(input: unknown, parsed?: TimeRange): string {
  if (typeof input === "string") return input;
  if (parsed && "days" in parsed) return String(parsed.days);
  if (parsed && "after" in parsed) return parsed.after;
  return "";
}
