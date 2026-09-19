import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { TenantsRepository } from "../db/tenants.repository";

const tenantInfo = new Hono<{ Bindings: Env }>();

/**
 * Публичная информация о заведении, нужная витрине для рендера:
 * название, логотип, цвет темы, валюта, и — важно — showBranding,
 * вычисленный из тарифа владельца (branding_removable), а не
 * хранящийся отдельным полем на tenant. Посетитель никогда не видит
 * telegram_bot_token или другие internal-поля — этот роут отдаёт
 * только то, что безопасно показать публично.
 */
tenantInfo.get("/", async (c) => {
  const tenant = requireTenant(c);
  const tenantsRepo = new TenantsRepository(c.env.DB);
  const subsRepo = new SubscriptionsRepository(c.env.DB);

  const record = await tenantsRepo.findById(tenant.tenantId);
  if (!record) {
    // Не должно случиться (tenantResolver уже проверил существование),
    // но типобезопасность важнее допущений.
    return c.json({ error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } }, 404);
  }

  const limits = await subsRepo.getPlanLimits(tenant.planId);

  return c.json({
    data: {
      name: record.name,
      logoUrl: record.logoUrl,
      themeColor: record.themeColor,
      currency: record.currency,
      showBranding: !limits.brandingRemovable,
    },
  });
});

export default tenantInfo;
