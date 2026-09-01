export interface AuthEnv {
  ACCESS_TOKEN?: string;
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }

  return diff === 0;
}

/**
 * Extracts access token from request URL query parameter `?token=...`
 * or Authorization Bearer header (`Authorization: Bearer ...`).
 */
export function extractToken(request: Request): string | null {
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken && queryToken.length > 0) {
      return queryToken;
    }
  } catch {
    // If URL parsing fails, continue to check headers
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Standard 401 Unauthorized response helper.
 * Returns HTTP 401 with JSON body `{"error":"unauthorized"}`.
 */
export function createUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Validates request against expected ACCESS_TOKEN in env.
 * Returns true if valid, false if invalid or ACCESS_TOKEN is unconfigured.
 */
export function authenticateRequest(request: Request, env: AuthEnv): boolean {
  const expectedToken = env.ACCESS_TOKEN;
  if (!expectedToken || expectedToken.trim().length === 0) {
    return false;
  }

  const providedToken = extractToken(request);
  if (!providedToken || providedToken.length === 0) {
    return false;
  }

  return timingSafeEqual(providedToken, expectedToken);
}

/**
 * Route guard helper for protected endpoints.
 * Returns null if authentication succeeds, or standard 401 Response if it fails.
 */
export function requireAuth(request: Request, env: AuthEnv): Response | null {
  if (!authenticateRequest(request, env)) {
    return createUnauthorizedResponse();
  }
  return null;
}
