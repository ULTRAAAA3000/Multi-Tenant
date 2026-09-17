import type {
  Subscription,
  PlanLimits,
  PlanId,
  SubscriptionStatus,
  PaymentProvider,
} from "../types/tenant";

interface SubscriptionRow {
  id: string;
  owner_id: string;
  plan_id: string;
  status: string;
  payment_provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

interface PlanLimitsRow {
  plan_id: string;
  max_tenants: number;
  max_products: number | null;
  custom_domain_allowed: number;
  online_payments_allowed: number;
  branding_removable: number;
  analytics_enabled: number;
  priority_support: number;
  custom_themes: number;
  price_usd_cents: number;
}

function mapRowToSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    ownerId: row.owner_id,
    planId: row.plan_id as PlanId,
    status: row.status as SubscriptionStatus,
    paymentProvider: row.payment_provider as PaymentProvider | null,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToPlanLimits(row: PlanLimitsRow): PlanLimits {
  return {
    planId: row.plan_id as PlanId,
    maxTenants: row.max_tenants,
    maxProducts: row.max_products,
    customDomainAllowed: row.custom_domain_allowed === 1,
    onlinePaymentsAllowed: row.online_payments_allowed === 1,
    brandingRemovable: row.branding_removable === 1,
    analyticsEnabled: row.analytics_enabled === 1,
    prioritySupport: row.priority_support === 1,
    customThemes: row.custom_themes === 1,
    priceUsdCents: row.price_usd_cents,
  };
}

export class SubscriptionsRepository {
  constructor(private readonly db: D1Database) {}

  async findByOwner(ownerId: string): Promise<Subscription | null> {
    const row = await this.db
      .prepare("SELECT * FROM subscriptions WHERE owner_id = ?1 LIMIT 1")
      .bind(ownerId)
      .first<SubscriptionRow>();
    return row ? mapRowToSubscription(row) : null;
  }

  /**
   * Возвращает подписку владельца, а если она отсутствует —
   * виртуальный free-план (не создавая строку в БД).
   * Это удобно для аккаунтов, которые еще не разу не подписывались.
   */
  async getEffectivePlanId(ownerId: string): Promise<PlanId> {
    const sub = await this.findByOwner(ownerId);
    if (!sub) return "free";
    if (sub.status === "canceled" || sub.status === "past_due") return "free";
    return sub.planId;
  }

  async getPlanLimits(planId: PlanId): Promise<PlanLimits> {
    const row = await this.db
      .prepare("SELECT * FROM plan_limits WHERE plan_id = ?1 LIMIT 1")
      .bind(planId)
      .first<PlanLimitsRow>();
    if (!row) {
      throw new Error(`Unknown plan_id: ${planId}`);
    }
    return mapRowToPlanLimits(row);
  }

  async createOrUpdate(
    id: string,
    params: {
      ownerId: string;
      planId: PlanId;
      status: SubscriptionStatus;
      paymentProvider?: PaymentProvider | null;
      providerCustomerId?: string | null;
      providerSubscriptionId?: string | null;
      currentPeriodEnd?: string | null;
    }
  ): Promise<Subscription> {
    const now = new Date().toISOString();
    const existing = await this.findByOwner(params.ownerId);

    if (existing) {
      await this.db
        .prepare(
          `UPDATE subscriptions
           SET plan_id = ?1, status = ?2, payment_provider = ?3,
               provider_customer_id = ?4, provider_subscription_id = ?5,
               current_period_end = ?6, updated_at = ?7
           WHERE owner_id = ?8`
        )
        .bind(
          params.planId,
          params.status,
          params.paymentProvider ?? null,
          params.providerCustomerId ?? null,
          params.providerSubscriptionId ?? null,
          params.currentPeriodEnd ?? null,
          now,
          params.ownerId
        )
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO subscriptions
             (id, owner_id, plan_id, status, payment_provider, provider_customer_id,
              provider_subscription_id, current_period_end, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`
        )
        .bind(
          id,
          params.ownerId,
          params.planId,
          params.status,
          params.paymentProvider ?? null,
          params.providerCustomerId ?? null,
          params.providerSubscriptionId ?? null,
          params.currentPeriodEnd ?? null,
          now
        )
        .run();
    }

    const result = await this.findByOwner(params.ownerId);
    if (!result) throw new Error("Subscription upsert failed");
    return result;
  }
}
