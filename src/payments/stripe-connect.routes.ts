import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireAuth, requireOwnerId } from "../auth/middleware";
import { TenantsRepository } from "../db/tenants.repository";
import { StripeConnectService } from "./stripe-connect";
import { encryptSecret } from "../utils/crypto";
import { errorResponse, Errors, ApiError } from "../utils/api";
import { PaymentProviderError } from "./provider.interface";

const stripeConnect = new Hono<{ Bindings: Env }>();

function getConnectService(env: Env): StripeConnectService {
  if (!env.STRIPE_CONNECT_CLIENT_ID || !env.STRIPE_SECRET_KEY) {
    throw new ApiError(
      503,
      "STRIPE_CONNECT_NOT_CONFIGURED",
      "Stripe Connect is not configured for this deployment"
    );
  }
  return new StripeConnectService(env.STRIPE_CONNECT_CLIENT_ID, env.STRIPE_SECRET_KEY);
}

/**
 * Возвращает ссылку авторизации Stripe для конкретного заведения
 * владельца. Защищено requireAuth — вызывается из дашборда, где
 * владелец уже залогинен и явно указывает, какое из своих tenants
 * подключает (tenantId передаётся как query param, а не резолвится
 * из Host, т.к. дашборд обслуживается не с поддомена заведения).
 */
stripeConnect.get("/connect", requireAuth(), async (c) => {
  const ownerId = requireOwnerId(c);
  const tenantId = c.req.query("tenant_id");

  if (!tenantId) {
    return errorResponse(c, Errors.validation('Query parameter "tenant_id" is required'));
  }

  const tenantsRepo = new TenantsRepository(c.env.DB);
  const tenant = await tenantsRepo.findById(tenantId);

  if (!tenant || tenant.ownerId !== ownerId) {
    return errorResponse(c, Errors.notFound("Storefront"));
  }

  try {
    const service = getConnectService(c.env);
    const redirectUri = `https://${c.env.BASE_DOMAIN}/auth/stripe/callback`;
    const url = service.buildAuthorizeUrl({ tenantId: tenant.id, redirectUri });
    return c.json({ data: { url } });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

/**
 * Callback, на который Stripe редиректит пользователя после
 * авторизации. НЕ защищён requireAuth — на этом шаге у нас нет
 * Authorization-заголовка (это браузерный редирект, не fetch),
 * так что владение tenant проверяется ЧЕРЕЗ state вместо этого:
 * state был выдан ТОЛЬКО владельцу этого tenant на шаге /connect,
 * так что валидный state = доказательство, что запрос легитимен.
 *
 * Ошибки здесь не возвращаются как JSON — пользователь смотрит на
 * это глазами в браузере, поэтому редиректим в дашборд с query-
 * параметром статуса вместо JSON-ответа с кодом ошибки.
 */
stripeConnect.get("/callback", async (c) => {
  const code = c.req.query("code");
  const tenantId = c.req.query("state");
  const dashboardBase = `https://${c.env.BASE_DOMAIN}/dashboard`;

  if (!code || !tenantId) {
    return c.redirect(`${dashboardBase}?stripe_connect=error&reason=missing_params`);
  }

  const tenantsRepo = new TenantsRepository(c.env.DB);
  const tenant = await tenantsRepo.findById(tenantId);

  if (!tenant) {
    // state не соответствует реальному tenant — не показываем
    // детали ошибки, просто редиректим как неуспех, чтобы не давать
    // атакующему сигнал о том, какие tenantId существуют.
    return c.redirect(`${dashboardBase}?stripe_connect=error&reason=invalid_state`);
  }

  try {
    const service = getConnectService(c.env);
    const { stripeUserId, accessToken } = await service.exchangeCodeForToken(code);

    const encryptedToken = await encryptSecret(
      accessToken,
      c.env.TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY // тот же ключ шифрования секретов, что и для Telegram
    );

    await tenantsRepo.connectStripe(tenant.id, {
      stripeUserId,
      stripeAccessToken: encryptedToken,
    });

    return c.redirect(
      `${dashboardBase}?stripe_connect=success&tenant_id=${encodeURIComponent(tenant.id)}`
    );
  } catch (err) {
    console.error("Stripe Connect callback failed:", err);
    const reason = err instanceof PaymentProviderError ? "provider_error" : "unknown";
    return c.redirect(`${dashboardBase}?stripe_connect=error&reason=${reason}`);
  }
});

/**
 * Отключение Stripe Connect. Защищено requireAuth (в отличие от
 * callback — это действие внутри дашборда, не браузерный редирект
 * от Stripe), scoped по ownerId так же, как /admin/tenants.
 */
stripeConnect.post("/disconnect", requireAuth(), async (c) => {
  const ownerId = requireOwnerId(c);
  const tenantsRepo = new TenantsRepository(c.env.DB);

  const body = await c.req.json<{ tenantId?: string }>().catch(() => ({ tenantId: undefined }));
  const tenantId = body.tenantId;

  if (!tenantId) {
    return errorResponse(c, Errors.validation('Field "tenantId" is required'));
  }

  const tenant = await tenantsRepo.findById(tenantId);
  if (!tenant || tenant.ownerId !== ownerId) {
    return errorResponse(c, Errors.notFound("Storefront"));
  }

  if (!tenant.stripeUserId) {
    return errorResponse(
      c,
      Errors.validation("This storefront doesn't have a connected Stripe account")
    );
  }

  const service = getConnectService(c.env);
  await service.revokeAccess(tenant.stripeUserId); // best-effort, не блокирует локальное отключение

  const updated = await tenantsRepo.disconnectStripe(tenant.id);
  return c.json({ data: updated });
});

export default stripeConnect;
