export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("aborted");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
  try {
    return await fetch(url, { ...init, signal: combined });
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`connection error: ${message}`);
  }
}

export async function fetchHtml(url: string, signal?: AbortSignal, acceptLang = ACCEPT_LANG): Promise<string> {
  const response = await fetchWithTimeout(
    url,
    {
      headers: { "user-agent": USER_AGENT, "accept-language": acceptLang },
      redirect: "follow",
    },
    12_000,
    signal,
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  const html = await response.text();
  if (response.status === 202 || /anomaly|captcha|unusual traffic|robot check/i.test(html.slice(0, 4000))) {
    throw new Error("DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works");
  }
  return html;
}

export async function fetchHtmlWithRetry(
  url: string,
  signal?: AbortSignal,
  acceptLang = ACCEPT_LANG,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const html = await fetchHtml(url, signal, acceptLang);
      if (html.length > 500) return html;
      lastError = new Error(`empty response (${html.length} bytes)`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw lastError instanceof Error ? lastError : new Error("fetch failed");
}

export function parseJsonOrSse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          return JSON.parse(line.slice(6)) as unknown;
        } catch {
          // keep scanning
        }
      }
    }
  }
  return null;
}

export async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "";
  }
}
