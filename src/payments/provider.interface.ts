/**
 * Общий контракт, которому подчиняются все платёжные провайдеры.
 * Роуты и бизнес-логика (создание заказа, обновление payment_status)
 * работают только через этот интерфейс, не зная деталей конкретного
 * провайдера. Добавление нового провайдера = новый класс,
 * реализующий этот интерфейс, без изменений в остальном коде.
 */

export interface CreatePaymentIntentParams {
  tenantId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  customerEmail?: string | undefined;
  successUrl: string;
  cancelUrl: string;
  /**
   * Stripe Connected Account ID (acct_...), если у tenant подключен
   * Stripe Connect. Когда задан, Checkout Session создаётся ОТ ИМЕНИ
   * этого аккаунта (заголовок Stripe-Account) — деньги идут напрямую
   * на счёт заведения, минуя платформенный аккаунт. Не используется
   * другими провайдерами (Monopay не имеет этого паттерна).
   */
  stripeAccount?: string | undefined;
}

export interface PaymentIntentResult {
  /** URL, на который нужно редиректнуть покупателя для оплаты. */
  checkoutUrl: string;
  /** Идентификатор платежа у провайдера, сохраняется в orders.payment_provider-специфичных полях. */
  providerPaymentId: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventType: "payment_succeeded" | "payment_failed" | "unknown";
  orderId: string | null;
  providerPaymentId: string | null;
}

export interface PaymentProviderAdapter {
  readonly providerName: "stripe" | "paddle" | "monopay";

  /**
   * Создаёт платёжную сессию/intent и возвращает URL для редиректа
   * покупателя на страницу оплаты провайдера.
   */
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;

  /**
   * Верифицирует подпись входящего webhook и извлекает из него
   * orderId и статус платежа. Каждый провайдер подписывает webhooks
   * по-своему (Stripe: Stripe-Signature header, Monopay: X-Sign, etc) —
   * эта деталь инкапсулирована внутри конкретной реализации.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerificationResult>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
