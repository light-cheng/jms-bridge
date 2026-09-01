import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeJmsBytesForClash,
  parseBandwidthResponse,
  formatSubscriptionUserinfo,
  calculateBandwidthStatus,
  fetchBandwidthData,
  handleStatusRequest,
} from "../src/bandwidth";

describe("Bandwidth Utilities", () => {
  describe("normalizeJmsBytesForClash", () => {
    it("converts 500GB decimal to Clash binary byte representation", () => {
      const jmsBytes = 500000000000;
      const normalized = normalizeJmsBytesForClash(jmsBytes);
      expect(normalized).toBe(536870912000);
    });

    it("converts 125GB decimal to Clash binary byte representation", () => {
      const jmsBytes = 125000000000;
      const normalized = normalizeJmsBytesForClash(jmsBytes);
      expect(normalized).toBe(134217728000);
    });

    it("converts 1GB decimal (10^9 bytes) to 1GiB bytes (2^30 bytes)", () => {
      const jmsBytes = 1000000000;
      const normalized = normalizeJmsBytesForClash(jmsBytes);
      expect(normalized).toBe(1073741824);
    });

    it("preserves exact ratio between used and total", () => {
      const jmsTotal = 500000000000;
      const jmsUsed = 125000000000;
      const normTotal = normalizeJmsBytesForClash(jmsTotal);
      const normUsed = normalizeJmsBytesForClash(jmsUsed);

      expect(jmsUsed / jmsTotal).toBe(0.25);
      expect(normUsed / normTotal).toBe(0.25);
    });

    it("returns 0 for 0 bytes", () => {
      expect(normalizeJmsBytesForClash(0)).toBe(0);
    });

    it("handles boundary, negative and non-finite inputs safely by returning 0", () => {
      expect(normalizeJmsBytesForClash(-100)).toBe(0);
      expect(normalizeJmsBytesForClash(NaN)).toBe(0);
      expect(normalizeJmsBytesForClash(Infinity)).toBe(0);
      expect(normalizeJmsBytesForClash(-Infinity)).toBe(0);
    });

    it("rounds fractions to nearest integer", () => {
      expect(normalizeJmsBytesForClash(1)).toBe(1);
    });
  });

  describe("parseBandwidthResponse", () => {
    it("parses valid payload with all fields", () => {
      const raw = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 125000000000,
        bw_reset_day_of_month: 16,
      };

      const result = parseBandwidthResponse(raw);
      expect(result).toEqual({
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 125000000000,
        bw_reset_day_of_month: 16,
      });
    });

    it("parses valid payload without bw_reset_day_of_month", () => {
      const raw = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 125000000000,
      };

      const result = parseBandwidthResponse(raw);
      expect(result).toEqual({
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 125000000000,
      });
    });

    it("parses valid payload with bw_reset_day_of_month as null or undefined", () => {
      const rawNull = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 0,
        bw_reset_day_of_month: null,
      };
      expect(parseBandwidthResponse(rawNull)).toEqual({
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 0,
      });

      const rawUndefined = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 0,
        bw_reset_day_of_month: undefined,
      };
      expect(parseBandwidthResponse(rawUndefined)).toEqual({
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 0,
      });
    });

    it("accepts boundary values for bw_reset_day_of_month (1 and 31)", () => {
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: 100,
          bw_counter_b: 10,
          bw_reset_day_of_month: 1,
        })
      ).toEqual({
        monthly_bw_limit_b: 100,
        bw_counter_b: 10,
        bw_reset_day_of_month: 1,
      });

      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: 100,
          bw_counter_b: 10,
          bw_reset_day_of_month: 31,
        })
      ).toEqual({
        monthly_bw_limit_b: 100,
        bw_counter_b: 10,
        bw_reset_day_of_month: 31,
      });
    });

    it("accepts zero usage and zero limit", () => {
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: 0,
          bw_counter_b: 0,
        })
      ).toEqual({
        monthly_bw_limit_b: 0,
        bw_counter_b: 0,
      });
    });

    it("rejects non-object inputs", () => {
      expect(parseBandwidthResponse(null)).toBeNull();
      expect(parseBandwidthResponse(undefined)).toBeNull();
      expect(parseBandwidthResponse("string")).toBeNull();
      expect(parseBandwidthResponse(123)).toBeNull();
      expect(parseBandwidthResponse(true)).toBeNull();
      expect(parseBandwidthResponse([])).toBeNull();
      expect(parseBandwidthResponse([1, 2, 3])).toBeNull();
    });

    it("rejects empty object or objects missing required fields", () => {
      expect(parseBandwidthResponse({})).toBeNull();
      expect(
        parseBandwidthResponse({ monthly_bw_limit_b: 500000000000 })
      ).toBeNull();
      expect(
        parseBandwidthResponse({ bw_counter_b: 125000000000 })
      ).toBeNull();
    });

    it("rejects string values for bandwidth fields", () => {
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: "500GB",
          bw_counter_b: 100,
        })
      ).toBeNull();
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: "500000000000",
          bw_counter_b: 100,
        })
      ).toBeNull();
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: 500000000000,
          bw_counter_b: "125GB",
        })
      ).toBeNull();
    });

    it("rejects negative numbers", () => {
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: -1,
          bw_counter_b: 10,
        })
      ).toBeNull();
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: 500,
          bw_counter_b: -10,
        })
      ).toBeNull();
    });

    it("rejects NaN and Infinite values", () => {
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: NaN,
          bw_counter_b: 10,
        })
      ).toBeNull();
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: 500,
          bw_counter_b: Infinity,
        })
      ).toBeNull();
      expect(
        parseBandwidthResponse({
          monthly_bw_limit_b: -Infinity,
          bw_counter_b: 0,
        })
      ).toBeNull();
    });

    it("rejects invalid bw_reset_day_of_month values", () => {
      const base = { monthly_bw_limit_b: 100, bw_counter_b: 10 };

      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: 0 })).toBeNull();
      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: 32 })).toBeNull();
      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: -1 })).toBeNull();
      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: 15.5 })).toBeNull();
      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: "16" })).toBeNull();
      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: NaN })).toBeNull();
      expect(parseBandwidthResponse({ ...base, bw_reset_day_of_month: Infinity })).toBeNull();
    });
  });

  describe("formatSubscriptionUserinfo", () => {
    it("formats subscription-userinfo string correctly", () => {
      const header = formatSubscriptionUserinfo(134217728000, 536870912000);
      expect(header).toBe(
        "upload=0; download=134217728000; total=536870912000; expire=0"
      );
    });

    it("formats zero values correctly", () => {
      const header = formatSubscriptionUserinfo(0, 0);
      expect(header).toBe("upload=0; download=0; total=0; expire=0");
    });

    it("ensures upload is 0 and expire is always 0", () => {
      const header = formatSubscriptionUserinfo(500, 1000);
      expect(header.startsWith("upload=0;")).toBe(true);
      expect(header.endsWith("expire=0")).toBe(true);
    });
  });

  describe("calculateBandwidthStatus", () => {
    it("computes status metrics correctly for normal usage", () => {
      const data = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 125000000000,
        bw_reset_day_of_month: 16,
      };

      const status = calculateBandwidthStatus(data);
      expect(status).toEqual({
        used_bytes: 125000000000,
        total_bytes: 500000000000,
        remaining_bytes: 375000000000,
        used_percent: 25,
        reset_day: 16,
      });
    });

    it("handles zero usage", () => {
      const data = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 0,
        bw_reset_day_of_month: 1,
      };

      const status = calculateBandwidthStatus(data);
      expect(status).toEqual({
        used_bytes: 0,
        total_bytes: 500000000000,
        remaining_bytes: 500000000000,
        used_percent: 0,
        reset_day: 1,
      });
    });

    it("handles missing reset_day by setting reset_day to null", () => {
      const data = {
        monthly_bw_limit_b: 1000,
        bw_counter_b: 500,
      };

      const status = calculateBandwidthStatus(data);
      expect(status.reset_day).toBeNull();
      expect(status.used_percent).toBe(50);
    });

    it("clamps remaining_bytes to 0 when usage exceeds total limit", () => {
      const data = {
        monthly_bw_limit_b: 1000,
        bw_counter_b: 1500,
      };

      const status = calculateBandwidthStatus(data);
      expect(status.remaining_bytes).toBe(0);
      expect(status.used_percent).toBe(150);
    });

    it("handles zero total_bytes safely without division by zero NaN", () => {
      const data = {
        monthly_bw_limit_b: 0,
        bw_counter_b: 0,
      };

      const status = calculateBandwidthStatus(data);
      expect(status.remaining_bytes).toBe(0);
      expect(status.used_percent).toBe(0);
    });

    it("rounds percentage to two decimal places", () => {
      const data = {
        monthly_bw_limit_b: 300,
        bw_counter_b: 100,
      };

      const status = calculateBandwidthStatus(data);
      expect(status.used_percent).toBe(33.33);
    });
  });

  describe("fetchBandwidthData", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("fetches and returns parsed bandwidth data on 200 OK", async () => {
      const mockPayload = {
        monthly_bw_limit_b: 500000000000,
        bw_counter_b: 125000000000,
        bw_reset_day_of_month: 16,
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await fetchBandwidthData("https://example.com/bw?service=1&id=secret");
      expect(result).toEqual(mockPayload);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("throws bandwidth_upstream_failed when upstream returns non-200 status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
        })
      );

      await expect(
        fetchBandwidthData("https://example.com/bw?service=1&id=secret")
      ).rejects.toThrow("bandwidth_upstream_failed");
    });

    it("throws invalid_bandwidth_response when upstream returns invalid JSON", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("not a json string", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      );

      await expect(
        fetchBandwidthData("https://example.com/bw?service=1&id=secret")
      ).rejects.toThrow("invalid_bandwidth_response");
    });

    it("throws invalid_bandwidth_response when upstream returns invalid schema", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ monthly_bw_limit_b: "500GB" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await expect(
        fetchBandwidthData("https://example.com/bw?service=1&id=secret")
      ).rejects.toThrow("invalid_bandwidth_response");
    });

    it("throws bandwidth_upstream_failed on network error without leaking secrets", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

      await expect(
        fetchBandwidthData("https://example.com/bw?service=1&id=secret-uuid-12345")
      ).rejects.toThrow("bandwidth_upstream_failed");
    });
  });

  describe("handleStatusRequest", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns 502 bandwidth_upstream_failed if JMS_BW_URL is not set", async () => {
      const response = await handleStatusRequest({});
      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "bandwidth_upstream_failed" });
    });

    it("returns 200 with status metrics on success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            monthly_bw_limit_b: 500000000000,
            bw_counter_b: 125000000000,
            bw_reset_day_of_month: 16,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const response = await handleStatusRequest({
        JMS_BW_URL: "https://example.com/bw?id=secret",
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({
        used_bytes: 125000000000,
        total_bytes: 500000000000,
        remaining_bytes: 375000000000,
        used_percent: 25,
        reset_day: 16,
      });
    });

    it("returns 502 on upstream failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Server Error", { status: 500 })
      );

      const response = await handleStatusRequest({
        JMS_BW_URL: "https://example.com/bw?id=secret",
      });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({ error: "bandwidth_upstream_failed" });
    });

    it("returns 502 on invalid JSON response from upstream", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ invalid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const response = await handleStatusRequest({
        JMS_BW_URL: "https://example.com/bw?id=secret",
      });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({ error: "invalid_bandwidth_response" });
    });
  });
});
