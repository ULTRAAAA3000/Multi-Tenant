import { PaymentProviderError } from "./provider.interface";

interface StripeOAuthTokenResponse {
  stripe_user_id?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Stripe Connect OAuth (Standard accounts). Владелец заведения
 * авторизуется на стороне Stripe и мы получаем Connected Account ID
 * без того, чтобы он вручную копировал Secret/Publishable Key —
 * именно то, что требует задача "Zero-Friction для Европы".
 *
 * Документация: https://docs.stripe.com/connect/oauth-standard-accounts
 */
export class StripeConnectService {
  constructor(
    private readonly clientId: string,
    private readonly secretKey: string
  ) {}

  /**
   * Генерирует ссылку авторизации. state = tenantId — используется
   * для восстановления контекста в callback (Stripe не знает про
   * наш tenant_id, он просто возвращает его обратно как есть).
   * ВАЖНО: вызывающий код должен убедиться, что state не подделан
   * (см. verifyState в callback-роуте) — иначе злоумышленник может
   * подключить свой Stripe-аккаунт к чужому tenant.
   */
  buildAuthorizeUrl(params: { tenantId: string; redirectUri: string }): string {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: "read_write",
      redirect_uri: params.redirectUri,
      state: params.tenantId,
    });
    return `https://connect.stripe.com/oauth/authorize?${query.toString()}`;
  }

  /**
   * Обменивает временный OAuth code на постоянный access_token и
   * Connected Account ID. Вызывается один раз в callback-роуте сразу
   * после того, как Stripe редиректнул пользователя обратно к нам.
   */
  async exchangeCodeForToken(code: string): Promise<{ stripeUserId: string; accessToken: string }> {
    const response = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_secret: this.secretKey,
        code,
        grant_type: "authorization_code",
      }).toString(),
    });

    const result = (await response.json()) as StripeOAuthTokenResponse;

    if (!response.ok || result.error) {
      throw new PaymentProviderError(
        result.error_description ?? "Stripe Connect authorization failed",
        "stripe"
      );
    }

    if (!result.stripe_user_id || !result.access_token) {
      throw new PaymentProviderError(
        "Stripe did not return expected connection details",
        "stripe"
      );
    }

    return { stripeUserId: result.stripe_user_id, accessToken: result.access_token };
  }

  /**
   * Отзывает доступ на стороне Stripe при отключении интеграции.
   * Best-effort: если запрос к Stripe не удался (например, токен уже
   * был отозван вручную в Stripe Dashboard), это не должно блокировать
   * локальное отключение — данные в нашей БД всё равно нужно очистить.
   */
  async revokeAccess(stripeUserId: string): Promise<{ revoked: boolean }> {
    try {
      const response = await fetch("https://connect.stripe.com/oauth/deauthorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          stripe_user_id: stripeUserId,
        }).toString(),
      });
      return { revoked: response.ok };
    } catch (err) {
      console.error("Stripe deauthorize request failed:", err);
      return { revoked: false };
    }
  }
}
