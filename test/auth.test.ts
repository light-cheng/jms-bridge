import { describe, it, expect } from "vitest";
import {
  extractToken,
  timingSafeEqual,
  createUnauthorizedResponse,
  authenticateRequest,
  requireAuth,
  AuthEnv,
} from "../src/auth";

describe("Authentication Module", () => {
  describe("timingSafeEqual", () => {
    it("returns true for identical strings", () => {
      expect(timingSafeEqual("abc123XYZ", "abc123XYZ")).toBe(true);
      expect(timingSafeEqual("", "")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
      expect(timingSafeEqual("abc123", "abc124")).toBe(false);
      expect(timingSafeEqual("password", "passw0rd")).toBe(false);
    });

    it("returns false for strings of different lengths", () => {
      expect(timingSafeEqual("short", "longer_string")).toBe(false);
      expect(timingSafeEqual("a", "")).toBe(false);
      expect(timingSafeEqual("", "a")).toBe(false);
    });

    it("handles special characters and unicode securely", () => {
      expect(timingSafeEqual("token!@#$%^&*()_+", "token!@#$%^&*()_+")).toBe(true);
      expect(timingSafeEqual("token!@#$%^&*()_+", "token!@#$%^&*()_=")).toBe(false);
    });
  });

  describe("extractToken", () => {
    it("extracts token from URL query parameter ?token=...", () => {
      const req = new Request("http://localhost/clash?token=secret123");
      expect(extractToken(req)).toBe("secret123");
    });

    it("extracts query token when multiple query parameters exist", () => {
      const req = new Request("http://localhost/clash?foo=bar&token=my-token-456&baz=qux");
      expect(extractToken(req)).toBe("my-token-456");
    });

    it("extracts token from Authorization: Bearer header", () => {
      const req = new Request("http://localhost/clash", {
        headers: {
          Authorization: "Bearer bearer-secret-789",
        },
      });
      expect(extractToken(req)).toBe("bearer-secret-789");
    });

    it("extracts token from case-insensitive Bearer header (e.g. bearer)", () => {
      const req = new Request("http://localhost/clash", {
        headers: {
          Authorization: "bearer case-insensitive-token",
        },
      });
      expect(extractToken(req)).toBe("case-insensitive-token");
    });

    it("prefers query token over Bearer header if query token is present", () => {
      const req = new Request("http://localhost/clash?token=query-token", {
        headers: {
          Authorization: "Bearer header-token",
        },
      });
      expect(extractToken(req)).toBe("query-token");
    });

    it("falls back to Bearer header if query token is empty (?token=)", () => {
      const req = new Request("http://localhost/clash?token=", {
        headers: {
          Authorization: "Bearer header-token",
        },
      });
      expect(extractToken(req)).toBe("header-token");
    });

    it("returns null if no token in query and no Authorization header", () => {
      const req = new Request("http://localhost/clash");
      expect(extractToken(req)).toBeNull();
    });

    it("returns null if Authorization header is not Bearer (e.g. Basic)", () => {
      const req = new Request("http://localhost/clash", {
        headers: {
          Authorization: "Basic dXNlcjpwYXNz",
        },
      });
      expect(extractToken(req)).toBeNull();
    });

    it("returns null if Bearer header has no token value", () => {
      const req = new Request("http://localhost/clash", {
        headers: {
          Authorization: "Bearer ",
        },
      });
      expect(extractToken(req)).toBeNull();
    });
  });

  describe("createUnauthorizedResponse", () => {
    it("returns 401 status with application/json header and unauthorized error body", async () => {
      const res = createUnauthorizedResponse();
      expect(res.status).toBe(401);
      expect(res.headers.get("Content-Type")).toBe("application/json");

      const body = await res.json();
      expect(body).toEqual({ error: "unauthorized" });
    });

    it("never includes sensitive secret data in unauthorized response", async () => {
      const res = createUnauthorizedResponse();
      const text = await res.text();
      expect(text).toBe('{"error":"unauthorized"}');
      expect(text).not.toContain("token");
      expect(text).not.toContain("ACCESS_TOKEN");
      expect(text).not.toContain("secret");
    });
  });

  describe("authenticateRequest", () => {
    const validEnv: AuthEnv = {
      ACCESS_TOKEN: "valid-secret-token",
    };

    it("returns true for matching query token", () => {
      const req = new Request("http://localhost/clash?token=valid-secret-token");
      expect(authenticateRequest(req, validEnv)).toBe(true);
    });

    it("returns true for matching Bearer header token", () => {
      const req = new Request("http://localhost/clash", {
        headers: {
          Authorization: "Bearer valid-secret-token",
        },
      });
      expect(authenticateRequest(req, validEnv)).toBe(true);
    });

    it("returns false for incorrect query token", () => {
      const req = new Request("http://localhost/clash?token=wrong-token");
      expect(authenticateRequest(req, validEnv)).toBe(false);
    });

    it("returns false for incorrect Bearer header token", () => {
      const req = new Request("http://localhost/clash", {
        headers: {
          Authorization: "Bearer wrong-token",
        },
      });
      expect(authenticateRequest(req, validEnv)).toBe(false);
    });

    it("returns false when no token is provided", () => {
      const req = new Request("http://localhost/clash");
      expect(authenticateRequest(req, validEnv)).toBe(false);
    });

    it("returns false when ACCESS_TOKEN is undefined in env", () => {
      const req = new Request("http://localhost/clash?token=valid-secret-token");
      expect(authenticateRequest(req, {})).toBe(false);
    });

    it("returns false when ACCESS_TOKEN is empty string in env", () => {
      const req = new Request("http://localhost/clash?token=valid-secret-token");
      expect(authenticateRequest(req, { ACCESS_TOKEN: "" })).toBe(false);
    });

    it("returns false when ACCESS_TOKEN is whitespace only in env", () => {
      const req = new Request("http://localhost/clash?token=valid-secret-token");
      expect(authenticateRequest(req, { ACCESS_TOKEN: "   " })).toBe(false);
    });
  });

  describe("requireAuth", () => {
    const env: AuthEnv = {
      ACCESS_TOKEN: "secure-token-999",
    };

    it("returns null when request has valid authentication", () => {
      const req = new Request("http://localhost/status?token=secure-token-999");
      const authError = requireAuth(req, env);
      expect(authError).toBeNull();
    });

    it("returns 401 Response when request has missing token", async () => {
      const req = new Request("http://localhost/status");
      const authError = requireAuth(req, env);
      expect(authError).not.toBeNull();
      expect(authError?.status).toBe(401);
      expect(await authError?.json()).toEqual({ error: "unauthorized" });
    });

    it("returns 401 Response when request has invalid token", async () => {
      const req = new Request("http://localhost/status?token=invalid");
      const authError = requireAuth(req, env);
      expect(authError).not.toBeNull();
      expect(authError?.status).toBe(401);
      expect(await authError?.json()).toEqual({ error: "unauthorized" });
    });
  });
});
