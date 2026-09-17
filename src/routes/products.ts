import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { enforceProductLimit } from "../middleware/plan-limits";
import { ProductsRepository } from "../db/products.repository";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import {
  requireString,
  optionalString,
  optionalBoolean,
  requirePositiveInt,
} from "../utils/validation";

const products = new Hono<{ Bindings: Env }>();

products.get("/", async (c) => {
  const tenant = requireTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const onlyAvailable = c.req.query("only_available") === "true";
  const categoryId = c.req.query("category_id") ?? undefined;

  const list = await repo.listByTenant(tenant.tenantId, { onlyAvailable, categoryId });
  return c.json({ data: list });
});

products.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const product = await repo.findById(c.req.param("id"), tenant.tenantId);
  if (!product) return errorResponse(c, Errors.notFound("Product"));
  return c.json({ data: product });
});

// enforceProductLimit проверяет лимит ПЕРЕД выполнением хендлера создания.
products.post("/", enforceProductLimit(), async (c) => {
  const tenant = requireTenant(c);
  const repo = new ProductsRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = requireString(body.name, "name", 200);
    const description = optionalString(body.description, "description", 2000);
    const priceCents = requirePositiveInt(body.priceCents, "priceCents");
    const imageUrl = optionalString(body.imageUrl, "imageUrl", 1000);
    const isAvailable = optionalBoolean(body.isAvailable, "isAvailable");
    const sortOrder =
      body.sortOrder !== undefined ? requirePositiveInt(body.sortOrder, "sortOrder") : undefined;
    const categoryId = optionalString(body.categoryId, "categoryId", 100);

    const created = await repo.create(generateId(), tenant.tenantId, {
      name,
      description: description ?? null,
      priceCents,
      imageUrl: imageUrl ?? null,
      isAvailable,
      sortOrder,
      categoryId: categoryId ?? null,
    });

    return c.json({ data: created }, 201);
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

products.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Product"));

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = body.name !== undefined ? requireString(body.name, "name", 200) : undefined;
    const description = optionalString(body.description, "description", 2000);
    const priceCents =
      body.priceCents !== undefined ? requirePositiveInt(body.priceCents, "priceCents") : undefined;
    const imageUrl = optionalString(body.imageUrl, "imageUrl", 1000);
    const isAvailable = optionalBoolean(body.isAvailable, "isAvailable");
    const sortOrder =
      body.sortOrder !== undefined ? requirePositiveInt(body.sortOrder, "sortOrder") : undefined;
    const categoryId = optionalString(body.categoryId, "categoryId", 100);

    const updated = await repo.update(id, tenant.tenantId, {
      name,
      description,
      priceCents,
      imageUrl,
      isAvailable,
      sortOrder,
      categoryId,
    });

    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

products.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Product"));

  await repo.delete(id, tenant.tenantId);
  return c.body(null, 204);
});

export default products;
