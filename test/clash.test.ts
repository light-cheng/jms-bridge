import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchSubscriptionYaml, handleClashRequest, ClashEnv } from "../src/clash";

describe("Clash Subscription Module (src/clash.ts)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleYaml = `# JMS Mihomo Subscription
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false

proxies:
  - name: "JMS-1-US"
    type: ss
    server: c1.example.com
    port: 10001
    cipher: aes-256-gcm
    password: "secret-password"
  - name: "JMS-2-UK"
    type: vmess
    server: c2.example.com
    port: 10002
    uuid: "11111111-2222-3333-4444-555555555555"
    alterId: 0
    cipher: auto
    tls: true

proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - "JMS-1-US"
      - "JMS-2-UK"

rules:
  - MATCH,PROXY
`;

  const validBandwidthJson = {
    monthly_bw_limit_b: 500000000000,
    bw_counter_b: 125000000000,
    bw_reset_day_of_month: 16,
  };

  const defaultEnv: ClashEnv = {
    ACCESS_TOKEN: "valid-secret-token",
    JMS_SUB_URL: "https://jmssub.net/members/getsub.php?service=12345&id=secret-sub-uuid",
    JMS_BW_URL: "https://justmysocks6.net/members/getbwcounter.php?service=12345&id=secret-bw-uuid",
  };

  describe("fetchSubscriptionYaml", () => {
    it("fetches and returns exact unmodified YAML string on 200 OK", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(sampleYaml, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );

      const result = await fetchSubscriptionYaml("https://example.com/sub.yaml");
      expect(result).toBe(sampleYaml);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("throws subscription_upstream_failed on non-200 HTTP status without leaking URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Not Found", { status: 404 })
      );

      await expect(
        fetchSubscriptionYaml("https://secret-domain.com/secret-path?id=secret-uuid")
      ).rejects.toThrow("subscription_upstream_failed");

      await expect(
        fetchSubscriptionYaml("https://secret-domain.com/secret-path?id=secret-uuid")
      ).rejects.toSatisfy((err: Error) => {
        expect(err.message).not.toContain("secret");
        expect(err.message).not.toContain("https://");
        return true;
      });
    });

    it("throws subscription_upstream_failed on network error or timeout", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection reset"));

      await expect(
        fetchSubscriptionYaml("https://example.com/sub.yaml")
      ).rejects.toThrow("subscription_upstream_failed");
    });
  });

  describe("handleClashRequest - Authentication", () => {
    it("returns 401 unauthorized when token is missing", async () => {
      const request = new Request("http://localhost/clash");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      const body = await response.json();
      expect(body).toEqual({ error: "unauthorized" });
    });

    it("returns 401 unauthorized when token is invalid", async () => {
      const request = new Request("http://localhost/clash?token=wrong-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: "unauthorized" });
    });

    it("does not initiate any upstream fetch when auth fails", async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const request = new Request("http://localhost/clash?token=wrong-token");
      await handleClashRequest(request, defaultEnv);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("handleClashRequest - Missing JMS_SUB_URL", () => {
    it("returns 502 when JMS_SUB_URL is not configured", async () => {
      const env: ClashEnv = {
        ACCESS_TOKEN: "valid-secret-token",
        JMS_BW_URL: "https://example.com/bw",
      };

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, env);

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      const body = await response.json();
      expect(body).toEqual({ error: "subscription_upstream_failed" });
    });
  });

  describe("handleClashRequest - Full Success (GET & HEAD)", () => {
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
            new Response(JSON.stringify(validBandwidthJson), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.reject(new Error("Unknown URL in test mock"));
      });
    });

    it("GET /clash returns 200, unmodified YAML body, and all required headers with normalized bandwidth", async () => {
      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);

      // Verify Headers
      expect(response.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
      expect(response.headers.get("profile-title")).toBe("Just My Socks");
      expect(response.headers.get("profile-update-interval")).toBe("6");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("ok");
      expect(response.headers.get("subscription-userinfo")).toBe(
        "upload=0; download=134217728000; total=536870912000; expire=0"
      );

      // Verify Body byte-for-byte fidelity
      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("GET /clash works with Authorization Bearer header", async () => {
      const request = new Request("http://localhost/clash", {
        headers: {
          Authorization: "Bearer valid-secret-token",
        },
      });
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("subscription-userinfo")).toBe(
        "upload=0; download=134217728000; total=536870912000; expire=0"
      );
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("ok");
      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("HEAD /clash returns 200, identical headers to GET, and empty body", async () => {
      const getRequest = new Request("http://localhost/clash?token=valid-secret-token", {
        method: "GET",
      });
      const headRequest = new Request("http://localhost/clash?token=valid-secret-token", {
        method: "HEAD",
      });

      const getResponse = await handleClashRequest(getRequest, defaultEnv);
      const headResponse = await handleClashRequest(headRequest, defaultEnv);

      expect(headResponse.status).toBe(200);

      // Check header equality
      expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
      expect(headResponse.headers.get("profile-title")).toBe(getResponse.headers.get("profile-title"));
      expect(headResponse.headers.get("profile-update-interval")).toBe(
        getResponse.headers.get("profile-update-interval")
      );
      expect(headResponse.headers.get("Cache-Control")).toBe(getResponse.headers.get("Cache-Control"));
      expect(headResponse.headers.get("X-JMS-Bandwidth-Status")).toBe(
        getResponse.headers.get("X-JMS-Bandwidth-Status")
      );
      expect(headResponse.headers.get("subscription-userinfo")).toBe(
        getResponse.headers.get("subscription-userinfo")
      );

      // Check body is empty
      const headBody = await headResponse.text();
      expect(headBody).toBe("");
    });
  });

  describe("handleClashRequest - Graceful Degradation on Bandwidth API Failure", () => {
    const setupSubSuccessAndBwFailure = (bwResponseOrError: Response | Error) => {
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
        if (bwResponseOrError instanceof Error) {
          return Promise.reject(bwResponseOrError);
        }
        return Promise.resolve(bwResponseOrError);
      });
    };

    it("returns 200 with YAML and X-JMS-Bandwidth-Status: unavailable when bandwidth API returns 500", async () => {
      setupSubSuccessAndBwFailure(new Response("Internal Server Error", { status: 500 }));

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
      expect(response.headers.get("profile-title")).toBe("Just My Socks");
      expect(response.headers.get("profile-update-interval")).toBe("6");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();

      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("returns 200 with YAML and X-JMS-Bandwidth-Status: unavailable when bandwidth API times out", async () => {
      setupSubSuccessAndBwFailure(new Error("Timeout"));

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();
      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("returns 200 with YAML and X-JMS-Bandwidth-Status: unavailable when bandwidth API returns malformed JSON", async () => {
      setupSubSuccessAndBwFailure(new Response("<html>Error page</html>", { status: 200 }));

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();
      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("returns 200 with YAML and X-JMS-Bandwidth-Status: unavailable when bandwidth API returns invalid schema", async () => {
      setupSubSuccessAndBwFailure(
        new Response(JSON.stringify({ monthly_bw_limit_b: -1, bw_counter_b: 0 }), { status: 200 })
      );

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();
      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("returns 200 with YAML and X-JMS-Bandwidth-Status: unavailable when JMS_BW_URL is not configured", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(sampleYaml, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );

      const env: ClashEnv = {
        ACCESS_TOKEN: "valid-secret-token",
        JMS_SUB_URL: "https://jmssub.net/members/getsub.php?service=12345&id=secret-sub-uuid",
      };

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();
      const bodyText = await response.text();
      expect(bodyText).toBe(sampleYaml);
    });

    it("HEAD /clash also gracefully degrades with empty body and X-JMS-Bandwidth-Status: unavailable", async () => {
      setupSubSuccessAndBwFailure(new Response("Internal Server Error", { status: 500 }));

      const request = new Request("http://localhost/clash?token=valid-secret-token", {
        method: "HEAD",
      });
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
      expect(response.headers.get("profile-title")).toBe("Just My Socks");
      expect(response.headers.get("profile-update-interval")).toBe("6");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-JMS-Bandwidth-Status")).toBe("unavailable");
      expect(response.headers.get("subscription-userinfo")).toBeNull();

      const bodyText = await response.text();
      expect(bodyText).toBe("");
    });
  });

  describe("handleClashRequest - Subscription Failure", () => {
    it("returns 502 subscription_upstream_failed when subscription returns 500 even if bandwidth succeeds", async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php") || url.includes("sub")) {
          return Promise.resolve(new Response("Server Error", { status: 500 }));
        }
        if (url.includes("getbwcounter.php") || url.includes("bw")) {
          return Promise.resolve(
            new Response(JSON.stringify(validBandwidthJson), { status: 200 })
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      const body = await response.json();
      expect(body).toEqual({ error: "subscription_upstream_failed" });
    });

    it("returns 502 subscription_upstream_failed when subscription fetch throws or times out", async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php") || url.includes("sub")) {
          return Promise.reject(new Error("Connection reset"));
        }
        if (url.includes("getbwcounter.php") || url.includes("bw")) {
          return Promise.resolve(
            new Response(JSON.stringify(validBandwidthJson), { status: 200 })
          );
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const request = new Request("http://localhost/clash?token=valid-secret-token");
      const response = await handleClashRequest(request, defaultEnv);

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      const body = await response.json();
      expect(body).toEqual({ error: "subscription_upstream_failed" });
    });
  });

  describe("handleClashRequest - Security", () => {
    it("never leaks secret tokens, UUIDs, or URLs in response body or headers", async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("getsub.php")) {
          return Promise.resolve(new Response(sampleYaml, { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify(validBandwidthJson), { status: 200 }));
      });

      const env: ClashEnv = {
        ACCESS_TOKEN: "super-secret-access-token-999",
        JMS_SUB_URL: "https://jmssub.net/members/getsub.php?service=98765&id=secret-sub-uuid-abc",
        JMS_BW_URL: "https://justmysocks6.net/members/getbwcounter.php?service=98765&id=secret-bw-uuid-xyz",
      };

      const request = new Request("http://localhost/clash?token=super-secret-access-token-999");
      const response = await handleClashRequest(request, env);

      // Check all headers
      for (const [headerName, headerValue] of response.headers.entries()) {
        expect(headerValue).not.toContain("super-secret-access-token-999");
        expect(headerValue).not.toContain("secret-sub-uuid-abc");
        expect(headerValue).not.toContain("secret-bw-uuid-xyz");
        expect(headerValue).not.toContain("98765");
        expect(headerValue).not.toContain("jmssub.net");
        expect(headerValue).not.toContain("justmysocks6.net");
      }
    });
  });
});
