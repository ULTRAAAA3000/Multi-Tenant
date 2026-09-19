import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireAuth, requireOwnerId } from "../auth/middleware";
import { SubscriptionsRepository } from "../db/subscriptions.repository";
import { TenantsRepository } from "../db/tenants.repository";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import { requireString } from "../utils/validation";
import type { PlanId } from "../types/tenant";

const billing = new Hono<{ Bindings: Env }>();

billing.use("*", requireAuth());

const VALID_PLANS: PlanId[] = ["free", "pro", "business"];

/**
 * Текущий тариф владельца + фактическое использование лимитов —
 * то, что рендерится "плашками выбора тарифа" на дашборде (счётчики
 * "3 / 5 storefronts", "18 / 20 products", и т.п.).
 */
billing.get("/", async (c) => {
  const ownerId = requireOwnerId(c);
  const subsRepo = new SubscriptionsRepository(c.env.DB);
  const tenantsRepo = new TenantsRepository(c.env.DB);

  const subscription = await subsRepo.findByOwner(ownerId);
  const planId = await subsRepo.getEffectivePlanId(ownerId);
  const limits = await subsRepo.getPlanLimits(planId);

  const tenants = await tenantsRepo.listByOwner(ownerId);
  const tenantCount = tenants.length;

  let totalProducts = 0;
  for (const tenant of tenants) {
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM products WHERE tenant_id = ?1"
    )
      .bind(tenant.id)
      .first<{ cnt: number }>();
    totalProducts += countRow?.cnt ?? 0;
  }

  return c.json({
    data: {
      subscription,
      plan: limits,
      usage: {
        tenants: tenantCount,
        products: totalProducts,
      },
    },
  });
});

/**
 * Список доступных тарифов со всеми лимитами — для рендера страницы
 * выбора плана ("плашки Free / Pro / Business").
 */
billing.get("/plans", async (c) => {
  const subsRepo = new SubscriptionsRepository(c.env.DB);
  const plans = await Promise.all(VALID_PLANS.map((id) => subsRepo.getPlanLimits(id)));
  return c.json({ data: plans });
});

/**
 * Смена тарифа. В реальном продакшене этот эндпоинт вызывается ПОСЛЕ
 * успешной оплаты через платёжный webhook (аналогично /payments/webhook
 * из Фазы 3) или сразу — для даунгрейда на free, который не требует
 * оплаты. Прямое изменение плана без прохождения через checkout — это
 * упрощение; полная интеграция Stripe Billing Portal / Subscriptions
 * API (создание Stripe Customer, Subscription, обработка recurring
 * платежей) требует настройки конкретных Price ID в Stripe Dashboard
 * и out of scope для этой фазы, помечено как следующий шаг ниже.
 */
billing.post("/change-plan", async (c) => {
  const ownerId = requireOwnerId(c);
  const subsRepo = new SubscriptionsRepository(c.env.DB);
  const tenantsRepo = new TenantsRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const planId = requireString(body.planId, "planId", 20) as PlanId;

    if (!VALID_PLANS.includes(planId)) {
      throw Errors.validation(`Field "planId" must be one of: ${VALID_PLANS.join(", ")}`);
    }

    // Защита от даунгрейда, который бы немедленно нарушил уже
    // существующие данные (например, у владельца 3 заведения,
    // а Free допускает только 1) — блокируем несовместимый даунгрейд,
    // а не молча оставляем аккаунт в противоречивом состоянии.
    if (planId !== "business") {
      const newLimits = await subsRepo.getPlanLimits(planId);
      const tenantCount = await tenantsRepo.countByOwner(ownerId);
      if (tenantCount > newLimits.maxTenants) {
        throw new ApiError(
          409,
          "DOWNGRADE_BLOCKED",
          `You have ${tenantCount} storefronts, but the ${planId} plan allows only ${newLimits.maxTenants}. Remove storefronts before downgrading.`
        );
      }
    }

    const updated = await subsRepo.createOrUpdate(generateId(), {
      ownerId,
      planId,
      status: "active",
    });

    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

export default billing;
