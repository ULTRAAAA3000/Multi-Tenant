import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { enforceOnlinePaymentsAllowed } from "../middleware/plan-limits";
import { OrdersRepository } from "../db/orders.repository";
import { TenantsRepository } from "../db/tenants.repository";
import { getPaymentAdapter, type SupportedProvider } from "./factory";
import { PaymentProviderError } from "./provider.interface";
import { errorResponse, Errors, ApiError } from "../utils/api";
import { requireString } from "../utils/validation";

const payments = new Hono<{ Bindings: Env }>();

const SUPPORTED_PROVIDERS: SupportedProvider[] = ["stripe", "monopay"];

/**
 * Создаёт checkout-сессию для существующего заказа и возвращает
 * URL, на который фронтенд должен редиректнуть покупателя.
 * Защищено enforceOnlinePaymentsAllowed — недоступно на Free тарифе.
 */
payments.post("/checkout", enforceOnlinePaymentsAllowed(), async (c) => {
  const tenant = requireTenant(c);
  const ordersRepo = new OrdersRepository(c.env.DB);
  const tenantsRepo = new TenantsRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const orderId = requireString(body.orderId, "orderId", 100);
    const provider = requireString(body.provider, "provider", 20) as SupportedProvider;
    const successUrl = requireString(body.successUrl, "successUrl", 1000);
    const cancelUrl = requireString(body.cancelUrl, "cancelUrl", 1000);

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw Errors.validation(
        `Field "provider" must be one of: ${SUPPORTED_PROVIDERS.join(", ")}`
      );
    }

    const order = await ordersRepo.findById(orderId, tenant.tenantId);
    if (!order) {
      return errorResponse(c, Errors.notFound("Order"));
    }
    if (order.paymentStatus === "paid") {
      throw Errors.validation("This order has already been paid");
    }

    // Для Stripe оплата должна идти НАПРЯМУЮ на счёт заведения через
    // Stripe Connect — без подключенного аккаунта деньги ушли бы на
    // платформенный аккаунт, что противоречит цели фичи. Monopay не
    // использует этот паттерн (у него нет Connect-аналога в данной
    // интеграции), поэтому проверка специфична для provider === "stripe".
    let stripeAccount: string | undefined;
    if (provider === "stripe") {
      const tenantRecord = await tenantsRepo.findById(tenant.tenantId);
      if (!tenantRecord?.stripeUserId) {
        throw new ApiError(
          409,
          "STRIPE_NOT_CONNECTED",
          "This storefront hasn't connected a Stripe account yet. Connect Stripe from the dashboard to accept online payments."
        );
      }
      stripeAccount = tenantRecord.stripeUserId;
    }

    const adapter = getPaymentAdapter(c.env, provider);
    const intent = await adapter.createPaymentIntent({
      tenantId: tenant.tenantId,
      orderId: order.id,
      amountCents: order.totalCents,
      currency: "USD", // валюта провайдера; tenant.currency используется для отображения, не для списания
      successUrl,
      cancelUrl,
      stripeAccount,
    });

    return c.json({ data: intent });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    if (err instanceof PaymentProviderError) {
      return errorResponse(c, new ApiError(502, "PAYMENT_PROVIDER_ERROR", err.message));
    }
    throw err;
  }
});

/**
 * Webhook-эндпоинт для входящих уведомлений от платёжных провайдеров.
 * ВАЖНО: этот роут НЕ проходит через tenantResolver (провайдер не
 * присылает наш Host-заголовок), поэтому tenant определяется из
 * metadata/reference внутри самого события после верификации подписи.
 * Регистрируется отдельно в index.ts, вне /api группы с tenantResolver.
 */
payments.post("/webhook/:provider", async (c) => {
  const providerParam = c.req.param("provider") as SupportedProvider;

  if (!SUPPORTED_PROVIDERS.includes(providerParam)) {
    return errorResponse(c, Errors.notFound("Payment provider"));
  }

  const rawBody = await c.req.text();
  const adapter = getPaymentAdapter(c.env, providerParam);

  const verification = await adapter.verifyWebhook(rawBody, c.req.raw.headers);

  if (!verification.isValid) {
    return errorResponse(c, new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Signature verification failed"));
  }

  if (!verification.orderId) {
    // Событие валидно, но не содержит распознаваемого orderId —
    // например, служебное событие провайдера, не связанное с заказом.
    return c.json({ received: true });
  }

  // Заказ ищем без tenant-скоупа (webhook не знает tenant заранее),
  // поэтому здесь прямой SQL-запрос по order.id глобально — это
  // единственное место в системе, где такой паттерн оправдан.
  const orderRow = await c.env.DB.prepare("SELECT tenant_id FROM orders WHERE id = ?1 LIMIT 1")
    .bind(verification.orderId)
    .first<{ tenant_id: string }>();

  if (!orderRow) {
    return c.json({ received: true }); // заказ не найден — ack без ошибки, провайдер не должен ретраить бесконечно
  }

  const ordersRepo = new OrdersRepository(c.env.DB);

  if (verification.eventType === "payment_succeeded") {
    await ordersRepo.updatePaymentStatus(
      verification.orderId,
      orderRow.tenant_id,
      "paid",
      providerParam
    );
  } else if (verification.eventType === "payment_failed") {
    await ordersRepo.updatePaymentStatus(
      verification.orderId,
      orderRow.tenant_id,
      "failed",
      providerParam
    );
  }

  return c.json({ received: true });
});

export default payments;
