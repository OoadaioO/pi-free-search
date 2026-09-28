import { decodeEntities, stripTags, wrapUntrustedBlock } from "./html.ts";
import { fetchWithTimeout, USER_AGENT } from "./http.ts";

const MAX_HTML_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 50_000;
const MAX_TEXT_LINES = 2000;

export type FetchPageResult = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  truncated: boolean;
  status: number;
};

export function assertFetchUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("url is required");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`invalid url: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http and https URLs are allowed");
  }
  return url;
}

export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? stripTags(titleMatch[1]) : "";
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(?:p|div|br|hr|h[1-6]|li|tr|section|article)[^>]*>/gi, "\n");
  const text = decodeEntities(cleaned.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export function truncateText(text: string): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  let truncated = false;
  let next = text;
  if (lines.length > MAX_TEXT_LINES) {
    next = lines.slice(0, MAX_TEXT_LINES).join("\n");
    truncated = true;
  }
  if (next.length > MAX_TEXT_CHARS) {
    next = next.slice(0, MAX_TEXT_CHARS);
    truncated = true;
  }
  return { text: next, truncated };
}

export function formatFetchContent(result: FetchPageResult): string {
  const header = `Fetched ${result.finalUrl}${result.title ? ` — ${result.title}` : ""}${result.truncated ? " (truncated)" : ""}`;
  return `${header}\n${wrapUntrustedBlock(result.text || "(empty page)")}`;
}

export async function fetchPage(rawUrl: string, signal?: AbortSignal): Promise<FetchPageResult> {
  const url = assertFetchUrl(rawUrl);
  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8" },
      redirect: "follow",
    },
    20_000,
    signal,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url.origin}${url.pathname}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  const sliced = buffer.byteLength > MAX_HTML_BYTES ? buffer.slice(0, MAX_HTML_BYTES) : buffer;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  const { title, text } = htmlToText(html);
  const truncatedBody = truncateText(text);
  return {
    url: url.toString(),
    finalUrl: response.url || url.toString(),
    title,
    text: truncatedBody.text,
    truncated: truncatedBody.truncated || buffer.byteLength > MAX_HTML_BYTES,
    status: response.status,
  };
}
