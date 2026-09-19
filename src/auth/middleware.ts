import type { Context, Next } from "hono";
import type { Env } from "../types/env";
import { verifySessionToken } from "./jwt";
import { errorResponse, Errors } from "../utils/api";

declare module "hono" {
  interface ContextVariableMap {
    ownerId: string;
    ownerEmail: string;
  }
}

/**
 * Middleware для admin-роутов: резолвит owner (владельца аккаунта)
 * из Authorization: Bearer <jwt> заголовка. В отличие от
 * tenantResolver (который определяет tenant по Host), это определяет
 * ЧЕЛОВЕКА, управляющего одним или несколькими tenants — используется
 * на /admin/* маршрутах, а не на публичных /api/* витрины.
 */
export function requireAuth() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return errorResponse(c, Errors.unauthorized());
    }

    const payload = await verifySessionToken(token, c.env.JWT_SECRET);
    if (!payload) {
      return errorResponse(c, Errors.unauthorized());
    }

    c.set("ownerId", payload.sub);
    c.set("ownerEmail", payload.email);
    await next();
  };
}

export function requireOwnerId(c: Context<{ Bindings: Env }>): string {
  const ownerId = c.get("ownerId");
  if (!ownerId) {
    throw new Error("requireAuth middleware did not run before this handler");
  }
  return ownerId;
}
