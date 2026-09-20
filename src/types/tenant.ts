export type PlanId = "free" | "pro" | "business";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing";

export type PaymentProvider = "stripe" | "paddle" | "monopay";

export interface PlanLimits {
  planId: PlanId;
  maxTenants: number;
  maxProducts: number | null; // null = безлимит
  customDomainAllowed: boolean;
  onlinePaymentsAllowed: boolean;
  brandingRemovable: boolean;
  analyticsEnabled: boolean;
  prioritySupport: boolean;
  customThemes: boolean;
  priceUsdCents: number;
}

export type PaymentMode = "cash_on_pickup" | "online";
export type NotificationChannel = "email" | "telegram";

export interface Tenant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  customDomain: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  logoUrl: string | null;
  themeColor: string;
  currency: string;
  isActive: boolean;
  stripeUserId: string | null;
  stripeAccessToken: string | null;
  stripeConnectedAt: string | null;
  notificationEmail: string | null;
  notificationChannels: NotificationChannel[];
  paymentMode: PaymentMode;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  ownerId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  paymentProvider: PaymentProvider | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantInput {
  ownerId: string;
  name: string;
  slug: string;
  currency?: string | undefined;
}

export interface UpdateTenantInput {
  name?: string | undefined;
  logoUrl?: string | undefined;
  themeColor?: string | undefined;
  currency?: string | undefined;
  telegramBotToken?: string | undefined;
  telegramChatId?: string | undefined;
  notificationEmail?: string | undefined;
  notificationChannels?: NotificationChannel[] | undefined;
  paymentMode?: PaymentMode | undefined;
}

/**
 * Поля, обновляемые ТОЛЬКО через Stripe Connect OAuth flow
 * (src/payments/stripe-connect.ts), не через обычный PATCH tenant —
 * stripe_access_token не должен приниматься как произвольный вход
 * от клиента, только как результат обмена OAuth code на токен.
 */
export interface StripeConnectionInput {
  stripeUserId: string;
  stripeAccessToken: string; // уже зашифрован вызывающим кодом
}
