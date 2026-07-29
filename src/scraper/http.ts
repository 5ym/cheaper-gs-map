const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 cheaper-gs-map/1.0 (+https://github.com/5ym/cheaper-gs-map)";

/** 連続アクセスを避けるための待機時間 (ms) */
const DELAY_MS = Number(process.env.FETCH_DELAY_MS ?? 700);
const MAX_RETRY = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let chain: Promise<unknown> = Promise.resolve();

/** リクエストを直列化し、間隔を空けて 1 本ずつ投げる */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = chain.then(task);
  chain = result.then(() => sleep(DELAY_MS), () => sleep(DELAY_MS));
  return result;
}

async function request(url: string, accept: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "ja" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return res;
      // 4xx はリトライしても無駄なので即座に諦める (429 は除く)
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} ${url}`);
      }
      lastError = new Error(`HTTP ${res.status} ${url}`);
    } catch (e) {
      lastError = e;
      if (e instanceof Error && e.message.startsWith("HTTP 4")) throw e;
    }
    if (attempt < MAX_RETRY) await sleep(1000 * 2 ** attempt);
  }
  throw lastError;
}

export function fetchHtml(url: string): Promise<string> {
  return serialize(async () => (await request(url, "text/html")).text());
}

export function fetchJson<T>(url: string): Promise<T> {
  return serialize(async () => (await request(url, "application/json")).json() as Promise<T>);
}
