export type PlanId = "free" | "pro" | "business";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";
export type PaymentMode = "cash_on_pickup" | "online";
export type NotificationChannel = "email" | "telegram";

export interface Tenant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  customDomain: string | null;
  telegramBotToken: string | null; // зашифрован на бэкенде, здесь только признак наличия
  telegramChatId: string | null;
  logoUrl: string | null;
  themeColor: string;
  currency: string;
  isActive: boolean;
  stripeUserId: string | null;
  stripeConnectedAt: string | null;
  notificationEmail: string | null;
  notificationChannels: NotificationChannel[];
  paymentMode: PaymentMode;
  createdAt: string;
  updatedAt: string;
}

export interface PlanLimits {
  planId: PlanId;
  maxTenants: number;
  maxProducts: number | null;
  customDomainAllowed: boolean;
  onlinePaymentsAllowed: boolean;
  brandingRemovable: boolean;
  analyticsEnabled: boolean;
  prioritySupport: boolean;
  customThemes: boolean;
  priceUsdCents: number;
}

export interface Subscription {
  id: string;
  ownerId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingInfo {
  subscription: Subscription | null;
  plan: PlanLimits;
  usage: {
    tenants: number;
    products: number;
  };
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = "new" | "confirmed" | "preparing" | "completed" | "canceled";
export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  id: string;
  tenantId: string;
  customerName: string;
  customerPhone: string | null;
  customerTelegram: string | null;
  deliveryAddress: string | null;
  comment: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: string | null;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
