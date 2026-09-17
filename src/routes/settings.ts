import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { SettingsRepository } from "../db/settings.repository";
import { ApiError, errorResponse, Errors } from "../utils/api";

const settings = new Hono<{ Bindings: Env }>();

settings.get("/", async (c) => {
  const tenant = requireTenant(c);
  const repo = new SettingsRepository(c.env.DB);
  const all = await repo.getAll(tenant.tenantId);
  return c.json({ data: all });
});

settings.get("/:key", async (c) => {
  const tenant = requireTenant(c);
  const repo = new SettingsRepository(c.env.DB);
  const value = await repo.get(tenant.tenantId, c.req.param("key"));
  if (value === null) return errorResponse(c, Errors.notFound("Setting"));
  return c.json({ data: { key: c.req.param("key"), value } });
});

/**
 * PUT (не PATCH) — settings это key-value store, семантика "заменить
 * набор целиком или создать" подходит лучше, чем частичное обновление.
 */
settings.put("/", async (c) => {
  const tenant = requireTenant(c);
  const repo = new SettingsRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const entries: Record<string, string | null> = {};

    for (const [key, value] of Object.entries(body)) {
      if (value !== null && typeof value !== "string") {
        throw Errors.validation(`Setting "${key}" must be a string or null`);
      }
      entries[key] = value;
    }

    if (Object.keys(entries).length === 0) {
      throw Errors.validation("Request body must contain at least one setting");
    }

    await repo.setMany(tenant.tenantId, entries);
    const all = await repo.getAll(tenant.tenantId);
    return c.json({ data: all });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

settings.delete("/:key", async (c) => {
  const tenant = requireTenant(c);
  const repo = new SettingsRepository(c.env.DB);
  await repo.delete(tenant.tenantId, c.req.param("key"));
  return c.body(null, 204);
});

export default settings;
