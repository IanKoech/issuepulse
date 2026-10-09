import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
export function isPublicAddress(address: string) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function monitorUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Use a public HTTP(S) URL on port 80 or 443, without credentials.",
    );
  url.hash = "";
  return url;
}
export async function probe(value: string): Promise<{
  state: "up" | "down";
  response_ms: number;
  status_code: number | null;
  error: string | null;
}> {
  const started = performance.now();
  try {
    const url = monitorUrl(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("DNS timeout")), 5000);
        timer.unref();
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error("Private and reserved destinations are blocked.");
    const pinned = addresses[0];
    const code = await new Promise<number>((resolve, reject) => {
      const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: "GET",
          headers: { "user-agent": "IssuePulse/0.1" },
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          },
        },
        (res) => {
          resolve(res.statusCode || 0);
          res.destroy();
        },
      );
      const timeout = setTimeout(
        () => req.destroy(new Error("Request timed out after 10 seconds")),
        10000,
      );
      req.on("close", () => clearTimeout(timeout));
      req.on("error", reject);
      req.end();
    });
    // Redirects are intentionally not followed; a redirect target must never bypass DNS checks.
    return {
      state: code >= 200 && code < 400 ? "up" : "down",
      response_ms: Math.round(performance.now() - started),
      status_code: code,
      error: code >= 400 ? `HTTP ${code}` : null,
    };
  } catch (error) {
    return {
      state: "down",
      response_ms: Math.round(performance.now() - started),
      status_code: null,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}
