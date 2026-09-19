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
}
