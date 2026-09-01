import { requireAuth } from "./auth";
import { handleStatusRequest } from "./bandwidth";
import { handleClashRequest } from "./clash";

export interface Env {
  JMS_SUB_URL?: string;
  JMS_BW_URL?: string;
  ACCESS_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Unauthenticated health check endpoint
    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Status endpoint (authenticated, GET only)
    if (url.pathname === "/status") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            Allow: "GET",
          },
        });
      }

      const authError = requireAuth(request, env);
      if (authError) {
        return authError;
      }
      return handleStatusRequest(env);
    }

    // Protected /clash endpoint (authenticated, supports GET and HEAD)
    if (url.pathname === "/clash") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            Allow: "GET, HEAD",
          },
        });
      }

      return handleClashRequest(request, env);
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
};
