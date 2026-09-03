import { setTimeout as delay } from "node:timers/promises";

export const CDC_UA =
  process.env.CDC_CRAWL_UA ??
  "cn-cdc-dashboard/0.1 (research archive; non-official structured data)";

/** Fetch HTML with 3 attempts and exponential backoff (1.2s, 2.4s, 4.8s). */
export async function fetchText(url, { retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": CDC_UA, Accept: "text/html" } });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await delay(1200 * 2 ** i);
    }
  }
  throw lastErr;
}

export function githubWarning(message) {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS) {
    const text = String(message).replace(/\r?\n/g, " ");
    console.log(`::warning::${text}`);
  }
}
