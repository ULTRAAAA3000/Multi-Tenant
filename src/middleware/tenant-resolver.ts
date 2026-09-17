import type { Context, Next } from "hono";
import type { Env } from "../types/env";
import { TenantsRepository } from "../db/tenants.repository";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { ApiError, errorResponse, Errors } from "../utils/api";
import type { PlanId } from "../types/tenant";

/**
 * Значения, которые кладутся в Hono context после резолва тенанта.
 * Доступны в любом хендлере ниже по цепочке через c.get(...).
 */
export interface TenantContext {
  tenantId: string;
  ownerId: string;
  planId: PlanId;
  isCustomDomain: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    tenant: TenantContext;
  }
}

/**
 * Извлекает slug из хоста вида "acme.yourdomain.com" -> "acme".
 * Возвращает null, если хост не является поддоменом BASE_DOMAIN
 * (в этом случае считаем, что это возможный custom domain).
 */
function extractSlugFromHost(host: string, baseDomain: string): string | null {
  const hostWithoutPort = host.split(":")[0] ?? host;
  const suffix = `.${baseDomain}`;
  if (hostWithoutPort === baseDomain) {
    return null; // запрос на сам корневой домен платформы, не на конкретный tenant
  }
  if (hostWithoutPort.endsWith(suffix)) {
    return hostWithoutPort.slice(0, -suffix.length);
  }
  return null;
}

/**
 * Middleware, определяющая tenant_id по заголовку Host:
 * 1. Если host = "{slug}.{BASE_DOMAIN}" -> ищем по slug.
 * 2. Иначе (произвольный домен) -> ищем по custom_domain.
 * Также проверяет, что tenant активен, и что custom domain
 * разрешен тарифом владельца (защита от обхода лимитов через
 * ручную привязку домена после даунгрейда).
 */
export function tenantResolver() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const host = c.req.header("host");
    if (!host) {
      return errorResponse(c, Errors.tenantNotFound());
    }

    const tenantsRepo = new TenantsRepository(c.env.DB);
    const subsRepo = new SubscriptionsRepository(c.env.DB);

    const slug = extractSlugFromHost(host, c.env.BASE_DOMAIN);

    const tenant = slug
      ? await tenantsRepo.findBySlug(slug)
      : await tenantsRepo.findByCustomDomain(host.split(":")[0] ?? host);

    if (!tenant) {
      return errorResponse(c, Errors.tenantNotFound());
    }

    if (!tenant.isActive) {
      return errorResponse(c, Errors.tenantInactive());
    }

    const planId = await subsRepo.getEffectivePlanId(tenant.ownerId);

    // Защита: если владелец больше не на Pro/Business, но домен остался
    // привязан в БД, custom domain запросы не должны обслуживаться как tenant.
    if (!slug) {
      const limits = await subsRepo.getPlanLimits(planId);
      if (!limits.customDomainAllowed) {
        return errorResponse(c, Errors.customDomainNotAllowed());
      }
    }

    const tenantContext: TenantContext = {
      tenantId: tenant.id,
      ownerId: tenant.ownerId,
      planId,
      isCustomDomain: slug === null,
    };

    c.set("tenant", tenantContext);
    await next();
  };
}

/**
 * Хелпер для хендлеров: достаёт tenant context и выбрасывает
 * понятную ошибку, если middleware почему-то не отработал раньше.
 */
export function requireTenant(c: Context<{ Bindings: Env }>): TenantContext {
  const tenant = c.get("tenant");
  if (!tenant) {
    throw new ApiError(
      500,
      "TENANT_CONTEXT_MISSING",
      "tenantResolver middleware did not run before this handler"
    );
  }
  return tenant;
}
