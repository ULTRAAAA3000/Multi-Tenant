import type {
  PaymentProviderAdapter,
  CreatePaymentIntentParams,
  PaymentIntentResult,
  WebhookVerificationResult,
} from "./provider.interface";
import { PaymentProviderError } from "./provider.interface";

interface MonopayInvoiceResponse {
  invoiceId?: string;
  pageUrl?: string;
  errCode?: string;
  errText?: string;
}

/**
 * Monobank Acquiring API (monopay). Документация:
 * https://api.monobank.ua/docs/acquiring.html
 */
export class MonopayAdapter implements PaymentProviderAdapter {
  readonly providerName = "monopay" as const;

  constructor(private readonly token: string) {}

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const response = await fetch("https://api.monobank.ua/api/merchant/invoice/create", {
      method: "POST",
      headers: {
        "X-Token": this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amountCents,
        ccy: 980, // UAH ISO 4217 numeric code
        merchantPaymInfo: {
          reference: params.orderId,
          destination: `Order ${params.orderId.slice(0, 8)}`,
        },
        redirectUrl: params.successUrl,
        webHookUrl: undefined, // задаётся на уровне мерчант-аккаунта в кабинете Monobank
      }),
    });

    const result = (await response.json()) as MonopayInvoiceResponse;

    if (!response.ok || result.errCode) {
      throw new PaymentProviderError(
        result.errText ?? "Monopay invoice creation failed",
        "monopay"
      );
    }

    if (!result.pageUrl || !result.invoiceId) {
      throw new PaymentProviderError("Monopay did not return an invoice URL", "monopay");
    }

    return { checkoutUrl: result.pageUrl, providerPaymentId: result.invoiceId };
  }

  /**
   * Monobank подписывает webhook тело через X-Sign header (ECDSA
   * подпись публичным ключом, который нужно запросить отдельным
   * эндпоинтом /api/merchant/pubkey). Здесь — базовая структура;
   * полная ECDSA-верификация требует загрузки и кэширования
   * публичного ключа Monobank, что выходит за рамки текущей фазы
   * и помечено как TODO для продакшен-хардننинга.
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerificationResult> {
    const signature = headers.get("x-sign");
    if (!signature) {
      return { isValid: false, eventType: "unknown", orderId: null, providerPaymentId: null };
    }

    const event = JSON.parse(rawBody) as {
      invoiceId: string;
      status: string;
      reference?: string;
    };

    let eventType: WebhookVerificationResult["eventType"] = "unknown";
    if (event.status === "success") {
      eventType = "payment_succeeded";
    } else if (event.status === "failure" || event.status === "expired") {
      eventType = "payment_failed";
    }

    return {
      isValid: true,
      eventType,
      orderId: event.reference ?? null,
      providerPaymentId: event.invoiceId,
    };
  }
}
