import type { Context, Next } from "hono";
import type { Env } from "../types/env";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { requireTenant } from "./tenant-resolver";
import { Errors, errorResponse } from "../utils/api";

/**
 * Middleware factory: перед созданием товара проверяет, не превышен
 * ли лимит max_products тарифа владельца. Вызывается ПОСЛЕ tenantResolver.
 */
export function enforceProductLimit() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const tenant = requireTenant(c);
    const subsRepo = new SubscriptionsRepository(c.env.DB);
    const limits = await subsRepo.getPlanLimits(tenant.planId);

    if (limits.maxProducts !== null) {
      const countRow = await c.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM products WHERE tenant_id = ?1"
      )
        .bind(tenant.tenantId)
        .first<{ cnt: number }>();

      const currentCount = countRow?.cnt ?? 0;
      if (currentCount >= limits.maxProducts) {
        return errorResponse(c, Errors.productLimitReached(limits.maxProducts));
      }
    }

    await next();
  };
}

/**
 * Middleware factory: перед созданием нового tenant (заведения)
 * проверяет лимит max_tenants тарифа владельца (Business = до 5).
 */
export function enforceTenantLimit() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // На этом шаге ownerId берём не из tenant-контекста (его еще нет,
    // мы создаём НОВЫЙ tenant), а из авторизованного пользователя,
    // положенного в контекст requireAuth middleware (src/auth/middleware.ts).
    const ownerId = c.get("ownerId");
    if (!ownerId) {
      return errorResponse(c, Errors.unauthorized());
    }

    const subsRepo = new SubscriptionsRepository(c.env.DB);
    const planId = await subsRepo.getEffectivePlanId(ownerId);
    const limits = await subsRepo.getPlanLimits(planId);

    const { TenantsRepository } = await import("../db/tenants.repository");
    const tenantsRepo = new TenantsRepository(c.env.DB);
    const currentCount = await tenantsRepo.countByOwner(ownerId);

    if (currentCount >= limits.maxTenants) {
      return errorResponse(c, Errors.tenantLimitReached(limits.maxTenants));
    }

    await next();
  };
}

/**
 * Middleware factory: блокирует включение online-оплаты в settings,
 * если тариф владельца её не разрешает.
 */
export function enforceOnlinePaymentsAllowed() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const tenant = requireTenant(c);
    const subsRepo = new SubscriptionsRepository(c.env.DB);
    const limits = await subsRepo.getPlanLimits(tenant.planId);

    if (!limits.onlinePaymentsAllowed) {
      return errorResponse(c, Errors.onlinePaymentsNotAllowed());
    }

    await next();
  };
}

/**
 * Middleware factory: блокирует привязку/изменение custom_domain,
 * если тариф владельца её не разрешает. Используется на роуте
 * PATCH /admin/tenant/domain (Фаза 5), но проверка бизнес-правила
 * живёт здесь, рядом с остальным limit enforcement.
 */
export function enforceCustomDomainAllowed() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const tenant = requireTenant(c);
    const subsRepo = new SubscriptionsRepository(c.env.DB);
    const limits = await subsRepo.getPlanLimits(tenant.planId);

    if (!limits.customDomainAllowed) {
      return errorResponse(c, Errors.customDomainNotAllowed());
    }

    await next();
  };
}
