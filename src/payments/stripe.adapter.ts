import type {
  PaymentProviderAdapter,
  CreatePaymentIntentParams,
  PaymentIntentResult,
  WebhookVerificationResult,
} from "./provider.interface";
import { PaymentProviderError } from "./provider.interface";

interface StripeCheckoutSessionResponse {
  id: string;
  url: string | null;
  error?: { message: string };
}

/**
 * Stripe Checkout Session — используем hosted checkout (а не Payment
 * Intents API напрямую), т.к. это не требует PCI-compliance на нашей
 * стороне и минимизирует объём кода для поддержки.
 */
export class StripeAdapter implements PaymentProviderAdapter {
  readonly providerName = "stripe" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string
  ) {}

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": params.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(params.amountCents),
      "line_items[0][price_data][product_data][name]": `Order ${params.orderId.slice(0, 8)}`,
      "line_items[0][quantity]": "1",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      "metadata[tenant_id]": params.tenantId,
      "metadata[order_id]": params.orderId,
    });

    if (params.customerEmail) {
      body.set("customer_email", params.customerEmail);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Stripe-Account заголовок направляет вызов "от имени" connected
    // account — это то, что заставляет деньги идти на счёт заведения,
    // а не на платформенный аккаунт. Без него (нет Stripe Connect у
    // tenant) сессия создаётся как обычно, на платформенный аккаунт —
    // такой заказ технически возможен, но противоречит цели фичи,
    // поэтому вызывающий код (payments/routes.ts) должен проверять
    // наличие stripeAccount перед вызовом этого метода для tenant-заказов.
    if (params.stripeAccount) {
      headers["Stripe-Account"] = params.stripeAccount;
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers,
      body: body.toString(),
    });

    const result = (await response.json()) as StripeCheckoutSessionResponse;

    if (!response.ok || result.error) {
      throw new PaymentProviderError(
        result.error?.message ?? "Stripe checkout session creation failed",
        "stripe"
      );
    }

    if (!result.url) {
      throw new PaymentProviderError("Stripe did not return a checkout URL", "stripe");
    }

    return { checkoutUrl: result.url, providerPaymentId: result.id };
  }

  /**
   * Верификация подписи Stripe webhook вручную через Web Crypto API
   * (HMAC-SHA256), т.к. официальный stripe-node SDK не совместим
   * с Workers runtime без дополнительных полифиллов.
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerificationResult> {
    const signatureHeader = headers.get("stripe-signature");
    if (!signatureHeader) {
      return { isValid: false, eventType: "unknown", orderId: null, providerPaymentId: null };
    }

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [key, value] = part.split("=");
        return [key, value];
      })
    );

    const timestamp = parts.t;
    const signature = parts.v1;

    if (!timestamp || !signature) {
      return { isValid: false, eventType: "unknown", orderId: null, providerPaymentId: null };
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSignature !== signature) {
      return { isValid: false, eventType: "unknown", orderId: null, providerPaymentId: null };
    }

    const event = JSON.parse(rawBody) as {
      type: string;
      data: { object: { id: string; metadata?: { order_id?: string } } };
      account?: string; // присутствует для Connect-событий (acct_...)
    };

    const orderId = event.data.object.metadata?.order_id ?? null;
    const providerPaymentId = event.data.object.id;

    let eventType: WebhookVerificationResult["eventType"] = "unknown";
    if (event.type === "checkout.session.completed") {
      eventType = "payment_succeeded";
    } else if (event.type === "checkout.session.expired") {
      eventType = "payment_failed";
    }

    return { isValid: true, eventType, orderId, providerPaymentId };
  }
}
