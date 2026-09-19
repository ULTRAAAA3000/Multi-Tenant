import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireAuth, requireOwnerId } from "../auth/middleware";
import { enforceTenantLimit } from "../middleware/plan-limits";
import { TenantsRepository } from "../db/tenants.repository";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { encryptSecret } from "../utils/crypto";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import { requireString, requireSlug, optionalString } from "../utils/validation";

const adminTenants = new Hono<{ Bindings: Env }>();

adminTenants.use("*", requireAuth());

/**
 * Список заведений текущего владельца. Не tenant-scoped через
 * tenantResolver (нет Host для этого) — scoped по ownerId из JWT.
 */
adminTenants.get("/", async (c) => {
  const ownerId = requireOwnerId(c);
  const repo = new TenantsRepository(c.env.DB);
  const list = await repo.listByOwner(ownerId);
  return c.json({ data: list });
});

adminTenants.get("/:id", async (c) => {
  const ownerId = requireOwnerId(c);
  const repo = new TenantsRepository(c.env.DB);
  const tenant = await repo.findById(c.req.param("id"));

  if (!tenant || tenant.ownerId !== ownerId) {
    return errorResponse(c, Errors.notFound("Storefront"));
  }

  return c.json({ data: tenant });
});

adminTenants.post("/", enforceTenantLimit(), async (c) => {
  const ownerId = requireOwnerId(c);
  const repo = new TenantsRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = requireString(body.name, "name", 200);
    const slug = requireSlug(body.slug);
    const currency = body.currency !== undefined ? requireString(body.currency, "currency", 10) : undefined;

    const existingSlug = await repo.findBySlug(slug);
    if (existingSlug) {
      throw new ApiError(409, "SLUG_TAKEN", `Slug "${slug}" is already in use`);
    }

    const created = await repo.create(generateId(), { ownerId, name, slug, currency });
    return c.json({ data: created }, 201);
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

/**
 * Обновление настроек заведения. telegramBotToken, если передан,
 * шифруется перед сохранением (см. src/utils/crypto.ts) — репозиторий
 * сохраняет только то, что получил, шифрование целиком на этом уровне.
 */
adminTenants.patch("/:id", async (c) => {
  const ownerId = requireOwnerId(c);
  const repo = new TenantsRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id);
  if (!existing || existing.ownerId !== ownerId) {
    return errorResponse(c, Errors.notFound("Storefront"));
  }

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = body.name !== undefined ? requireString(body.name, "name", 200) : undefined;
    const logoUrl = optionalString(body.logoUrl, "logoUrl", 1000);
    const themeColor = optionalString(body.themeColor, "themeColor", 20);
    const currency = optionalString(body.currency, "currency", 10);
    const telegramChatId = optionalString(body.telegramChatId, "telegramChatId", 100);

    let encryptedToken: string | undefined;
    if (body.telegramBotToken !== undefined) {
      const rawToken = requireString(body.telegramBotToken, "telegramBotToken", 200);
      encryptedToken = await encryptSecret(rawToken, c.env.TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY);
    }

    const updated = await repo.update(id, {
      name,
      logoUrl,
      themeColor,
      currency,
      telegramBotToken: encryptedToken,
      telegramChatId,
    });

    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

/**
 * Привязка custom domain — защищена enforceCustomDomainAllowed
 * (недоступно на Free тарифе). Middleware ожидает tenant-контекст
 * из tenantResolver, которого здесь нет — проверка лимита выполнена
 * вручную ниже, тем же паттерном, что enforceCustomDomainAllowed
 * использует внутри, но привязанным к ownerId вместо Host-резолвинга.
 */
adminTenants.patch("/:id/domain", async (c) => {
  const ownerId = requireOwnerId(c);
  const repo = new TenantsRepository(c.env.DB);
  const subsRepo = new SubscriptionsRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id);
  if (!existing || existing.ownerId !== ownerId) {
    return errorResponse(c, Errors.notFound("Storefront"));
  }

  const planId = await subsRepo.getEffectivePlanId(ownerId);
  const limits = await subsRepo.getPlanLimits(planId);
  if (!limits.customDomainAllowed) {
    return errorResponse(c, Errors.customDomainNotAllowed());
  }

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const domain = body.domain === null ? null : requireString(body.domain, "domain", 253);

    if (domain) {
      const existingDomain = await repo.findByCustomDomain(domain);
      if (existingDomain && existingDomain.id !== id) {
        throw new ApiError(409, "DOMAIN_TAKEN", `Domain "${domain}" is already in use`);
      }
    }

    await repo.setCustomDomain(id, domain);
    const updated = await repo.findById(id);
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

export default adminTenants;
