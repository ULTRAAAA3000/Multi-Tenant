import { Hono } from "hono";
import type { Env } from "./types/env";

const app = new Hono<{ Bindings: Env }>();

/**
 * Health-check эндпоинт. Полноценный роутинг с резолвингом
 * tenant_id по поддомену/custom domain и CRUD API добавляются
 * в Фазе 2 (Backend Core & Multi-Tenant Routing).
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    env: c.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default app;
