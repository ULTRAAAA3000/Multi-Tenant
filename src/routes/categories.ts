import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { CategoriesRepository } from "../db/categories.repository";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import { requireString, optionalBoolean, requirePositiveInt } from "../utils/validation";

const categories = new Hono<{ Bindings: Env }>();

categories.get("/", async (c) => {
  const tenant = requireTenant(c);
  const repo = new CategoriesRepository(c.env.DB);
  const includeInactive = c.req.query("include_inactive") === "true";
  const list = await repo.listByTenant(tenant.tenantId, includeInactive);
  return c.json({ data: list });
});

categories.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new CategoriesRepository(c.env.DB);
  const category = await repo.findById(c.req.param("id"), tenant.tenantId);
  if (!category) return errorResponse(c, Errors.notFound("Category"));
  return c.json({ data: category });
});

categories.post("/", async (c) => {
  const tenant = requireTenant(c);
  const repo = new CategoriesRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = requireString(body.name, "name", 200);
    const sortOrder =
      body.sortOrder !== undefined ? requirePositiveInt(body.sortOrder, "sortOrder") : undefined;

    const created = await repo.create(generateId(), tenant.tenantId, { name, sortOrder });
    return c.json({ data: created }, 201);
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

categories.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new CategoriesRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Category"));

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = body.name !== undefined ? requireString(body.name, "name", 200) : undefined;
    const sortOrder =
      body.sortOrder !== undefined ? requirePositiveInt(body.sortOrder, "sortOrder") : undefined;
    const isActive = optionalBoolean(body.isActive, "isActive");

    const updated = await repo.update(id, tenant.tenantId, { name, sortOrder, isActive });
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

categories.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new CategoriesRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Category"));

  await repo.delete(id, tenant.tenantId);
  return c.body(null, 204);
});

export default categories;
