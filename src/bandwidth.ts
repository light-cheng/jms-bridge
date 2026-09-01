/**
 * Bandwidth data returned from upstream JMS Bandwidth Counter API.
 */
export interface BandwidthData {
  monthly_bw_limit_b: number;
  bw_counter_b: number;
  bw_reset_day_of_month?: number;
}

/**
 * Status payload returned by GET /status.
 */
export interface BandwidthStatus {
  used_bytes: number;
  total_bytes: number;
  remaining_bytes: number;
  used_percent: number;
  reset_day: number | null;
}

/**
 * Normalizes decimal GB bytes from JMS into binary GiB bytes for Clash / Mihomo display.
 * Formula: Math.round((jmsBytes * 1073741824) / 1000000000)
 */
export function normalizeJmsBytesForClash(jmsBytes: number): number {
  if (!Number.isFinite(jmsBytes) || jmsBytes <= 0) {
    return 0;
  }
  return Math.round(jmsBytes * 1.073741824);
}

/**
 * Validates and parses the raw JSON from JMS Bandwidth Counter API.
 * Returns BandwidthData if valid, or null if invalid.
 */
export function parseBandwidthResponse(data: unknown): BandwidthData | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;

  const monthlyBwLimit = record.monthly_bw_limit_b;
  const bwCounter = record.bw_counter_b;
  const resetDay = record.bw_reset_day_of_month;

  if (
    typeof monthlyBwLimit !== "number" ||
    !Number.isFinite(monthlyBwLimit) ||
    monthlyBwLimit < 0
  ) {
    return null;
  }

  if (
    typeof bwCounter !== "number" ||
    !Number.isFinite(bwCounter) ||
    bwCounter < 0
  ) {
    return null;
  }

  if (resetDay !== undefined && resetDay !== null) {
    if (
      typeof resetDay !== "number" ||
      !Number.isInteger(resetDay) ||
      resetDay < 1 ||
      resetDay > 31
    ) {
      return null;
    }
  }

  const result: BandwidthData = {
    monthly_bw_limit_b: monthlyBwLimit,
    bw_counter_b: bwCounter,
  };

  if (typeof resetDay === "number") {
    result.bw_reset_day_of_month = resetDay;
  }

  return result;
}

/**
 * Formats the subscription-userinfo header string.
 * Note: expire is ALWAYS 0 per spec, never the monthly reset day.
 */
export function formatSubscriptionUserinfo(
  downloadBytes: number,
  totalBytes: number
): string {
  return `upload=0; download=${downloadBytes}; total=${totalBytes}; expire=0`;
}

/**
 * Calculates human-readable status metrics from raw upstream BandwidthData.
 */
export function calculateBandwidthStatus(data: BandwidthData): BandwidthStatus {
  const used_bytes = data.bw_counter_b;
  const total_bytes = data.monthly_bw_limit_b;
  const remaining_bytes = Math.max(0, total_bytes - used_bytes);
  const used_percent =
    total_bytes > 0
      ? Math.round((used_bytes / total_bytes) * 10000) / 100
      : 0;
  const reset_day = data.bw_reset_day_of_month ?? null;

  return {
    used_bytes,
    total_bytes,
    remaining_bytes,
    used_percent,
    reset_day,
  };
}

/**
 * Fetches and parses bandwidth data from upstream JMS Bandwidth API.
 * Throws errors with generic messages to prevent secret/URL leakage.
 */
export async function fetchBandwidthData(
  bwUrl: string,
  timeoutMs: number = 15000
): Promise<BandwidthData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(bwUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("bandwidth_upstream_failed");
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("invalid_bandwidth_response");
    }

    const parsed = parseBandwidthResponse(json);
    if (!parsed) {
      throw new Error("invalid_bandwidth_response");
    }

    return parsed;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message === "invalid_bandwidth_response" ||
        err.message === "bandwidth_upstream_failed")
    ) {
      throw err;
    }
    throw new Error("bandwidth_upstream_failed");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handler for GET /status endpoint.
 */
export async function handleStatusRequest(env: {
  JMS_BW_URL?: string;
}): Promise<Response> {
  if (!env.JMS_BW_URL || env.JMS_BW_URL.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "bandwidth_upstream_failed" }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const bandwidthData = await fetchBandwidthData(env.JMS_BW_URL);
    const status = calculateBandwidthStatus(bandwidthData);

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error && err.message === "invalid_bandwidth_response"
        ? "invalid_bandwidth_response"
        : "bandwidth_upstream_failed";

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
