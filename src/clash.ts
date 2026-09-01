import { requireAuth } from "./auth";
import {
  fetchBandwidthData,
  formatSubscriptionUserinfo,
  normalizeJmsBytesForClash,
} from "./bandwidth";

export interface ClashEnv {
  JMS_SUB_URL?: string;
  JMS_BW_URL?: string;
  ACCESS_TOKEN?: string;
}

/**
 * Fetches subscription YAML from upstream JMS Subscription URL.
 * Throws generic error to avoid leaking secret URLs or credentials.
 */
export async function fetchSubscriptionYaml(
  subUrl: string,
  timeoutMs: number = 15000
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(subUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("subscription_upstream_failed");
    }

    return await response.text();
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message === "subscription_upstream_failed"
    ) {
      throw err;
    }
    throw new Error("subscription_upstream_failed");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handles GET and HEAD requests to /clash endpoint.
 */
export async function handleClashRequest(
  request: Request,
  env: ClashEnv
): Promise<Response> {
  // 1. Authenticate request
  const authError = requireAuth(request, env);
  if (authError) {
    return authError;
  }

  // 2. Validate subscription URL is configured
  if (!env.JMS_SUB_URL || env.JMS_SUB_URL.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "subscription_upstream_failed" }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 3. Parallel upstream fetch for subscription YAML and bandwidth counter
  const subPromise = fetchSubscriptionYaml(env.JMS_SUB_URL);
  const bwPromise =
    env.JMS_BW_URL && env.JMS_BW_URL.trim().length > 0
      ? fetchBandwidthData(env.JMS_BW_URL)
          .then((data) => ({ ok: true as const, data }))
          .catch((err) => ({ ok: false as const, error: err }))
      : Promise.resolve({
          ok: false as const,
          error: new Error("missing_bw_url"),
        });

  let yamlBody: string;
  let bwResult:
    | { ok: true; data: import("./bandwidth").BandwidthData }
    | { ok: false; error: unknown };

  try {
    [yamlBody, bwResult] = await Promise.all([subPromise, bwPromise]);
  } catch {
    return new Response(
      JSON.stringify({ error: "subscription_upstream_failed" }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 4. Construct response headers
  const headers = new Headers();
  headers.set("Content-Type", "text/yaml; charset=utf-8");
  headers.set("profile-title", "Just My Socks");
  headers.set("profile-update-interval", "6");
  headers.set("Cache-Control", "no-store");

  if (bwResult.ok) {
    const downloadBytes = normalizeJmsBytesForClash(bwResult.data.bw_counter_b);
    const totalBytes = normalizeJmsBytesForClash(
      bwResult.data.monthly_bw_limit_b
    );
    headers.set(
      "subscription-userinfo",
      formatSubscriptionUserinfo(downloadBytes, totalBytes)
    );
    headers.set("X-JMS-Bandwidth-Status", "ok");
  } else {
    headers.set("X-JMS-Bandwidth-Status", "unavailable");
  }

  // 5. Return HEAD or GET response
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers,
    });
  }

  return new Response(yamlBody, {
    status: 200,
    headers,
  });
}
