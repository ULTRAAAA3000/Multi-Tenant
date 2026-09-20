import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireAuth } from "../auth/middleware";
import { resolveAdminTenant, requireAdminTenant } from "./tenant-context";
import { CategoriesRepository } from "../db/categories.repository";
import { ProductsRepository } from "../db/products.repository";
import { OrdersRepository } from "../db/orders.repository";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { MediaService, MediaUploadError } from "../services/media.service";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import {
  requireString,
  optionalString,
  optionalBoolean,
  requirePositiveInt,
} from "../utils/validation";
import type { OrderStatus } from "../types/catalog";

const catalog = new Hono<{ Bindings: Env }>();

/**
 * Все роуты этого файла требуют авторизации (requireAuth) и явного
 * X-Tenant-Id заголовка, проверенного на владение (resolveAdminTenant).
 * Это ЗЕРКАЛЬНЫЙ путь к тем же данным, что отдаёт публичный /api/*
 * (Фаза 2), но с другим способом определения tenant — для дашборда,
 * который сам не находится "внутри" одного заведения, как витрина.
 * Валидация и бизнес-правила переиспользуют те же репозитории, чтобы
 * не дублировать логику.
 */
catalog.use("*", requireAuth());
catalog.use("*", resolveAdminTenant());

// ============================================================
// CATEGORIES
// ============================================================

catalog.get("/categories", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new CategoriesRepository(c.env.DB);
  const includeInactive = c.req.query("include_inactive") === "true";
  const list = await repo.listByTenant(tenant.tenantId, includeInactive);
  return c.json({ data: list });
});

catalog.post("/categories", async (c) => {
  const tenant = requireAdminTenant(c);
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

catalog.patch("/categories/:id", async (c) => {
  const tenant = requireAdminTenant(c);
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

catalog.delete("/categories/:id", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new CategoriesRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Category"));

  await repo.delete(id, tenant.tenantId);
  return c.body(null, 204);
});

// ============================================================
// PRODUCTS
// ============================================================

catalog.get("/products", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const list = await repo.listByTenant(tenant.tenantId, {});
  return c.json({ data: list });
});

/**
 * Проверка лимита товаров переиспользует ту же бизнес-логику, что
 * enforceProductLimit в Фазе 2, но без прохождения через tenantResolver
 * middleware (его здесь нет) — проверка выполнена вручную тем же
 * способом, каким это уже сделано в enforceTenantLimit для создания
 * tenant (см. admin/tenants.ts).
 */
catalog.post("/products", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const subsRepo = new SubscriptionsRepository(c.env.DB);

  try {
    const limits = await subsRepo.getPlanLimits(tenant.planId);
    if (limits.maxProducts !== null) {
      const currentCount = await repo.countByTenant(tenant.tenantId);
      if (currentCount >= limits.maxProducts) {
        throw Errors.productLimitReached(limits.maxProducts);
      }
    }

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

catalog.patch("/products/:id", async (c) => {
  const tenant = requireAdminTenant(c);
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

catalog.delete("/products/:id", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new ProductsRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Product"));

  await repo.delete(id, tenant.tenantId);
  return c.body(null, 204);
});

// ============================================================
// MEDIA (product photo upload)
// ============================================================

catalog.post("/media/upload", async (c) => {
  const tenant = requireAdminTenant(c);
  const mediaService = new MediaService(c.env.MEDIA_BUCKET, `https://${c.env.BASE_DOMAIN}/media`);

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
    return errorResponse(
      c,
      Errors.validation('Request must be multipart/form-data with a "file" field')
    );
  }

  const uploadedFile = file as File;

  try {
    const arrayBuffer = await uploadedFile.arrayBuffer();
    const result = await mediaService.upload(tenant.tenantId, {
      data: arrayBuffer,
      mimeType: uploadedFile.type,
    });
    return c.json({ data: result }, 201);
  } catch (err) {
    if (err instanceof MediaUploadError) {
      return errorResponse(c, new ApiError(422, err.code, err.message));
    }
    throw err;
  }
});

// ============================================================
// ORDERS
// ============================================================

const VALID_STATUSES: OrderStatus[] = ["new", "confirmed", "preparing", "completed", "canceled"];

/**
 * ?since=<ISO8601> — используется дашбордом для polling (проверка
 * новых заказов раз в несколько секунд без перезагрузки всего списка).
 * Не отдельный WebSocket/SSE эндпоинт — обычный GET с фильтром по
 * created_at, что достаточно для интервала в несколько секунд и не
 * требует держать долгоживущее соединение на Workers.
 */
catalog.get("/orders", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new OrdersRepository(c.env.DB);

  const statusParam = c.req.query("status");
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

  const sinceParam = c.req.query("since");

  let list = await repo.listByTenant(tenant.tenantId, { status, limit: 200 });

  if (sinceParam) {
    const sinceDate = new Date(sinceParam);
    if (!Number.isNaN(sinceDate.getTime())) {
      list = list.filter((order) => new Date(order.createdAt) > sinceDate);
    }
  }

  return c.json({ data: list });
});

catalog.patch("/orders/:id/status", async (c) => {
  const tenant = requireAdminTenant(c);
  const repo = new OrdersRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Order"));

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const status = requireString(body.status, "status", 20) as OrderStatus;
    if (!VALID_STATUSES.includes(status)) {
      throw Errors.validation(`Field "status" must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const updated = await repo.updateStatus(id, tenant.tenantId, status);
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

export default catalog;
