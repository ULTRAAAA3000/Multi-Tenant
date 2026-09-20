import type { Context, Next } from "hono";
import type { Env } from "../types/env";
import { requireOwnerId } from "../auth/middleware";
import { TenantsRepository } from "../db/tenants.repository";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { errorResponse, Errors } from "../utils/api";
import type { PlanId } from "../types/tenant";

export interface AdminTenantContext {
  tenantId: string;
  ownerId: string;
  planId: PlanId;
}

declare module "hono" {
  interface ContextVariableMap {
    adminTenant: AdminTenantContext;
  }
}

/**
 * Аналог tenantResolver (Фаза 2), но для admin-контекста: там tenant
 * определяется по Host-заголовку (посетитель на поддомене заведения),
 * здесь — по явному X-Tenant-Id заголовку, потому что дашборд владельца
 * обслуживается с ОДНОГО домена, а не с поддомена каждого заведения,
 * и один владелец может управлять несколькими tenants за одну сессию.
 *
 * requireAuth должен идти ПЕРЕД этим middleware — он читает ownerId,
 * положенный туда JWT-верификацией.
 */
export function resolveAdminTenant() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ownerId = requireOwnerId(c);
    const tenantId = c.req.header("x-tenant-id");

    if (!tenantId) {
      return errorResponse(c, Errors.validation('Header "X-Tenant-Id" is required'));
    }

    const tenantsRepo = new TenantsRepository(c.env.DB);
    const tenant = await tenantsRepo.findById(tenantId);

    if (!tenant || tenant.ownerId !== ownerId) {
      // Одинаковый ответ для "не существует" и "не ваш" — не даём
      // владельцу другого аккаунта через код ошибки узнать, что
      // tenant с таким id вообще существует.
      return errorResponse(c, Errors.notFound("Storefront"));
    }

    const subsRepo = new SubscriptionsRepository(c.env.DB);
    const planId = await subsRepo.getEffectivePlanId(ownerId);

    c.set("adminTenant", { tenantId: tenant.id, ownerId, planId });
    await next();
  };
}

export function requireAdminTenant(c: Context<{ Bindings: Env }>): AdminTenantContext {
  const ctx = c.get("adminTenant");
  if (!ctx) {
    throw new Error("resolveAdminTenant middleware did not run before this handler");
  }
  return ctx;
}
