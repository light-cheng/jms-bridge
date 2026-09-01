import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { Env } from "../src/index";

describe("Worker Entrypoint", () => {
  const dummyCtx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("GET /healthz", () => {
    it("returns HTTP 200 with status ok and does not require token", async () => {
      const request = new Request("http://localhost/healthz", {
        method: "GET",
      });
      const env: Env = { ACCESS_TOKEN: "my-secret" };

      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({ status: "ok" });
    });
  });

  describe("Authentication on protected routes", () => {
    const env: Env = {
      ACCESS_TOKEN: "secret-token-123",
      JMS_SUB_URL: "https://example.com/sub",
      JMS_BW_URL: "https://example.com/bw",
    };

    it.each(["/clash", "/status"])("returns 401 for %s when token is missing", async (path) => {
      const request = new Request(`http://localhost${path}`);
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({ error: "unauthorized" });
    });

    it.each(["/clash", "/status"])("returns 401 for %s when token is invalid", async (path) => {
      const request = new Request(`http://localhost${path}?token=wrong-token`);
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({ error: "unauthorized" });
    });

    it.each(["/clash", "/status"])("returns 401 for %s when ACCESS_TOKEN is not configured", async (path) => {
      const request = new Request(`http://localhost${path}?token=secret-token-123`);
      const response = await worker.fetch(request, {}, dummyCtx);

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({ error: "unauthorized" });
    });

  });

  describe("/clash endpoint", () => {
    const env: Env = {
      ACCESS_TOKEN: "secret-token-123",
      JMS_SUB_URL: "https://jmssub.net/members/getsub.php?service=12345&id=secret-sub-uuid",
      JMS_BW_URL: "https://justmysocks6.net/members/getbwcounter.php?service=12345&id=secret-bw-uuid",
    };

    const sampleYaml = `mixed-port: 7890
proxies:
  - name: JMS-Test-Node
    type: ss
    server: s1.example.com
    port: 10001
    cipher: aes-256-gcm
    password: "secret-password"
`;

    const sampleBandwidthJson = {
      monthly_bw_limit_b: 500000000000,
      bw_counter_b: 125000000000,
      bw_reset_day_of_month: 16,
    };

    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php") || url.includes("sub")) {
          return Promise.resolve(
            new Response(sampleYaml, {
              status: 200,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
        if (url.includes("getbwcounter.php") || url.includes("bw")) {
          return Promise.resolve(
            new Response(JSON.stringify(sampleBandwidthJson), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      });
    });

    it("GET /clash returns 200 with raw YAML, subscription-userinfo, and profile headers", async () => {
      const request = new Request("http://localhost/clash?token=secret-token-123", {
        method: "GET",
      });
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
      expect(response.headers.get("profile-title")).toBe("Just My Socks");
      expect(response.headers.get("profile-update-interval")).toBe("6");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("ok");
      expect(response.headers.get("subscription-userinfo")).toBe(
        "upload=0; download=134217728000; total=536870912000; expire=0"
      );

      const body = await response.text();
      expect(body).toBe(sampleYaml);
    });

    it("HEAD /clash returns 200 with identical headers and null/empty body", async () => {
      const getReq = new Request("http://localhost/clash?token=secret-token-123", {
        method: "GET",
      });
      const headReq = new Request("http://localhost/clash?token=secret-token-123", {
        method: "HEAD",
      });

      const getRes = await worker.fetch(getReq, env, dummyCtx);
      const headRes = await worker.fetch(headReq, env, dummyCtx);

      expect(headRes.status).toBe(200);
      expect(headRes.headers.get("Content-Type")).toBe(getRes.headers.get("Content-Type"));
      expect(headRes.headers.get("profile-title")).toBe(getRes.headers.get("profile-title"));
      expect(headRes.headers.get("profile-update-interval")).toBe(
        getRes.headers.get("profile-update-interval")
      );
      expect(headRes.headers.get("Cache-Control")).toBe(getRes.headers.get("Cache-Control"));
      expect(headRes.headers.get("X-JMS-Bandwidth-Status")).toBe(
        getRes.headers.get("X-JMS-Bandwidth-Status")
      );
      expect(headRes.headers.get("subscription-userinfo")).toBe(
        getRes.headers.get("subscription-userinfo")
      );

      const body = await headRes.text();
      expect(body).toBe("");
    });

    it("GET /clash supports Authorization Bearer header", async () => {
      const request = new Request("http://localhost/clash", {
        headers: { Authorization: "Bearer secret-token-123" },
      });
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get("subscription-userinfo")).toBe(
        "upload=0; download=134217728000; total=536870912000; expire=0"
      );
      const body = await response.text();
      expect(body).toBe(sampleYaml);
    });

    it("gracefully degrades when bandwidth API fails (returns 200, raw YAML, X-JMS-Bandwidth-Status: unavailable)", async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php") || url.includes("sub")) {
          return Promise.resolve(
            new Response(sampleYaml, {
              status: 200,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
        return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
      });

      const request = new Request("http://localhost/clash?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();

      const body = await response.text();
      expect(body).toBe(sampleYaml);
    });

    it("gracefully degrades on HEAD /clash when bandwidth API fails", async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php") || url.includes("sub")) {
          return Promise.resolve(
            new Response(sampleYaml, {
              status: 200,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
        return Promise.reject(new Error("Timeout"));
      });

      const request = new Request("http://localhost/clash?token=secret-token-123", {
        method: "HEAD",
      });
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();

      const body = await response.text();
      expect(body).toBe("");
    });

    it("returns 502 subscription_upstream_failed when subscription fetch fails", async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php") || url.includes("sub")) {
          return Promise.resolve(new Response("Bad Gateway", { status: 502 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(sampleBandwidthJson), { status: 200 })
        );
      });

      const request = new Request("http://localhost/clash?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "subscription_upstream_failed" });
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])(
      "returns 405 Method Not Allowed for %s /clash with Allow: GET, HEAD",
      async (method) => {
        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy;

        const request = new Request(
          "http://localhost/clash?token=secret-token-123",
          {
            method,
          }
        );
        const response = await worker.fetch(request, env, dummyCtx);

        expect(response.status).toBe(405);
        expect(response.headers.get("Content-Type")).toBe("application/json");
        expect(response.headers.get("Allow")).toBe("GET, HEAD");

        const body = await response.json();
        expect(body).toEqual({ error: "method_not_allowed" });
        expect(fetchSpy).not.toHaveBeenCalled();
      }
    );
  });

  describe("GET /status", () => {
    const env: Env = {
      ACCESS_TOKEN: "secret-token-123",
      JMS_BW_URL: "https://justmysocks6.net/members/getbwcounter.php?service=12345&id=secret-uuid-67890",
    };

    it("returns 200 with bandwidth metrics on valid query token and successful upstream fetch", async () => {
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

      const request = new Request("http://localhost/status?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({
        used_bytes: 125000000000,
        total_bytes: 500000000000,
        remaining_bytes: 375000000000,
        used_percent: 25,
        reset_day: 16,
      });

      // Verify no secrets/URLs are present in the response
      const jsonString = JSON.stringify(data);
      expect(jsonString).not.toContain("https://");
      expect(jsonString).not.toContain("secret-uuid");
      expect(jsonString).not.toContain("12345");
      expect(jsonString).not.toContain("secret-token-123");
    });

    it("returns 200 with bandwidth metrics on valid Bearer auth header", async () => {
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

      const request = new Request("http://localhost/status", {
        headers: {
          Authorization: "Bearer secret-token-123",
        },
      });
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        used_bytes: 125000000000,
        total_bytes: 500000000000,
        remaining_bytes: 375000000000,
        used_percent: 25,
        reset_day: 16,
      });
    });

    it("returns 502 bandwidth_upstream_failed when upstream returns 500", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Upstream Error", { status: 500 })
      );

      const request = new Request("http://localhost/status?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({ error: "bandwidth_upstream_failed" });
    });

    it("returns 502 bandwidth_upstream_failed when upstream fetch times out / throws", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Timeout"));

      const request = new Request("http://localhost/status?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data).toEqual({ error: "bandwidth_upstream_failed" });
    });

    it("returns 502 invalid_bandwidth_response when upstream returns malformed JSON", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("not a json string", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      );

      const request = new Request("http://localhost/status?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data).toEqual({ error: "invalid_bandwidth_response" });
    });

    it("returns 502 invalid_bandwidth_response when upstream returns unexpected schema", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ monthly_bw_limit_b: "500GB" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const request = new Request("http://localhost/status?token=secret-token-123");
      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data).toEqual({ error: "invalid_bandwidth_response" });
    });

    it("returns 502 bandwidth_upstream_failed when JMS_BW_URL is unconfigured", async () => {
      const request = new Request("http://localhost/status?token=secret-token-123");
      const response = await worker.fetch(
        request,
        { ACCESS_TOKEN: "secret-token-123" },
        dummyCtx
      );

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data).toEqual({ error: "bandwidth_upstream_failed" });
    });

    it.each(["POST", "HEAD", "PUT", "PATCH", "DELETE"])(
      "returns 405 Method Not Allowed for %s /status with Allow: GET and does not fetch upstream",
      async (method) => {
        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy;

        const request = new Request(
          "http://localhost/status?token=secret-token-123",
          {
            method,
          }
        );
        const response = await worker.fetch(request, env, dummyCtx);

        expect(response.status).toBe(405);
        expect(response.headers.get("Content-Type")).toBe("application/json");
        expect(response.headers.get("Allow")).toBe("GET");

        const data = await response.json();
        expect(data).toEqual({ error: "method_not_allowed" });
        expect(fetchSpy).not.toHaveBeenCalled();
      }
    );
  });

  describe("Unknown routes", () => {
    it("returns 404 for unknown routes", async () => {
      const request = new Request("http://localhost/unknown", {
        method: "GET",
      });
      const env: Env = {};

      const response = await worker.fetch(request, env, dummyCtx);

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const data = await response.json();
      expect(data).toEqual({ error: "not_found" });
    });
  });
});
