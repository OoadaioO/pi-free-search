import type { Source } from "./types.ts";

const SNIPPET_NOISE =
  /\b(sign up|sign in|log in|login|subscribe( to| for)?|member[- ]?only|become a member|create (a )?free account|read more|continue reading|story continues|get started|install (the )?app|view on|medium membership|join \w+ for free|get updates from this writer|stories in your inbox|remember me for|unlock this|free to read|become a patron)\b/gi;

const UNTRUSTED_BOUNDARY_OPEN = "<untrusted-web-content>";
const UNTRUSTED_BOUNDARY_CLOSE = "</untrusted-web-content>";
const UNTRUSTED_BOUNDARY_TAG = /<\/?untrusted-web-content>/gi;

export function decodeEntities(text: string): string {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function stripTags(html: string): string {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function cleanSnippet(text: string | undefined): string | undefined {
  if (!text) return text;
  return String(text)
    .replace(SNIPPET_NOISE, " ")
    .replace(/^\s*(#{1,6}\s*|\[\s*x?\s*\]\s*|-\s*\[\s*x?\s*\]\s*|>\s*)/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function stripBoundaryTags(text: string): string {
  return typeof text === "string" ? text.replace(UNTRUSTED_BOUNDARY_TAG, "") : text;
}

export function wrapUntrustedBlock(text: string): string {
  return `${UNTRUSTED_BOUNDARY_OPEN}\n${stripBoundaryTags(text)}\n${UNTRUSTED_BOUNDARY_CLOSE}`;
}

export function uniqueSources(sources: Source[], limit: number): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const source of sources) {
    if (source.url && !seen.has(source.url)) {
      seen.add(source.url);
      out.push(source);
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function formatSearchContent(result: {
  provider: string;
  sources: Source[];
  content?: string;
  note?: string;
}): string {
  const lines = result.sources.map((source) => {
    const title = source.title ?? source.url;
    const snippet = source.snippet ? ` - ${source.snippet}` : "";
    const published = source.publishedAt ? ` (${source.publishedAt})` : "";
    return `- [${title}](${source.url})${snippet}${published}`;
  });
  const answer = result.content?.trim() ?? "";
  const body = `${lines.join("\n") || "No results found."}${answer ? `\n\n${answer}` : ""}`;
  const note = result.note?.trim() ? `${result.note.trim()}\n\n` : "";
  return `${note}Search (${result.provider}):\n${wrapUntrustedBlock(body)}`;
}
