import type { Env } from "../types/env";
import type { PaymentProviderAdapter } from "./provider.interface";
import { StripeAdapter } from "./stripe.adapter";
import { MonopayAdapter } from "./monopay.adapter";
import { ApiError } from "../utils/api";

export type SupportedProvider = "stripe" | "monopay";

export function getPaymentAdapter(env: Env, provider: SupportedProvider): PaymentProviderAdapter {
  switch (provider) {
    case "stripe": {
      if (!env.STRIPE_SECRET_KEY) {
        throw new ApiError(
          503,
          "PROVIDER_NOT_CONFIGURED",
          "Stripe is not configured for this deployment"
        );
      }
      // Webhook secret передаётся отдельно при верификации webhook,
      // т.к. он специфичен для конкретного Stripe webhook endpoint.
      // Здесь используется тот же секрет из env для простоты Фазы 3;
      // per-tenant webhook secrets — предмет доработки в Фазе 5
      // (billing module), если потребуется multi-account Stripe Connect.
      return new StripeAdapter(env.STRIPE_SECRET_KEY, env.STRIPE_SECRET_KEY);
    }
    case "monopay": {
      if (!env.MONOPAY_TOKEN) {
        throw new ApiError(
          503,
          "PROVIDER_NOT_CONFIGURED",
          "Monopay is not configured for this deployment"
        );
      }
      return new MonopayAdapter(env.MONOPAY_TOKEN);
    }
    default: {
      const exhaustiveCheck: never = provider;
      throw new ApiError(422, "UNSUPPORTED_PROVIDER", `Unknown provider: ${exhaustiveCheck}`);
    }
  }
}
