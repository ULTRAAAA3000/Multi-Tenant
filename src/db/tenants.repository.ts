import type {
  Tenant,
  CreateTenantInput,
  UpdateTenantInput,
  StripeConnectionInput,
  NotificationChannel,
  PaymentMode,
} from "../types/tenant";

/**
 * Плоская строка, как она приходит из D1 (snake_case, 0/1 для boolean).
 */
interface TenantRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  logo_url: string | null;
  theme_color: string;
  currency: string;
  is_active: number;
  stripe_user_id: string | null;
  stripe_access_token: string | null;
  stripe_connected_at: string | null;
  notification_email: string | null;
  notification_channels: string;
  payment_mode: string;
  created_at: string;
  updated_at: string;
}

function mapRowToTenant(row: TenantRow): Tenant {
  let notificationChannels: NotificationChannel[];
  try {
    notificationChannels = JSON.parse(row.notification_channels) as NotificationChannel[];
  } catch {
    // Защита от повреждённого JSON в старых строках — не должно
    // случиться при нормальной работе (единственный writer — этот
    // репозиторий), но лучше упасть в безопасный дефолт, чем 500.
    notificationChannels = ["email"];
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    customDomain: row.custom_domain,
    telegramBotToken: row.telegram_bot_token,
    telegramChatId: row.telegram_chat_id,
    logoUrl: row.logo_url,
    themeColor: row.theme_color,
    currency: row.currency,
    isActive: row.is_active === 1,
    stripeUserId: row.stripe_user_id,
    stripeAccessToken: row.stripe_access_token,
    stripeConnectedAt: row.stripe_connected_at,
    notificationEmail: row.notification_email,
    notificationChannels,
    paymentMode: row.payment_mode as PaymentMode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TenantsRepository {
  constructor(private readonly db: D1Database) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db
      .prepare("SELECT * FROM tenants WHERE slug = ?1 LIMIT 1")
      .bind(slug)
      .first<TenantRow>();
    return row ? mapRowToTenant(row) : null;
  }

  async findByCustomDomain(domain: string): Promise<Tenant | null> {
    const row = await this.db
      .prepare("SELECT * FROM tenants WHERE custom_domain = ?1 LIMIT 1")
      .bind(domain)
      .first<TenantRow>();
    return row ? mapRowToTenant(row) : null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const row = await this.db
      .prepare("SELECT * FROM tenants WHERE id = ?1 LIMIT 1")
      .bind(id)
      .first<TenantRow>();
    return row ? mapRowToTenant(row) : null;
  }

  /**
   * Ищет tenant по Stripe Connected Account ID — нужно для webhook-
   * обработчиков, которые получают stripe_account в событии, но не
   * знают tenant_id напрямую (аналогично паттерну payments/routes.ts
   * из Фазы 3, где заказ ищется по orderId, а не по Host-заголовку).
   */
  async findByStripeUserId(stripeUserId: string): Promise<Tenant | null> {
    const row = await this.db
      .prepare("SELECT * FROM tenants WHERE stripe_user_id = ?1 LIMIT 1")
      .bind(stripeUserId)
      .first<TenantRow>();
    return row ? mapRowToTenant(row) : null;
  }

  async listByOwner(ownerId: string): Promise<Tenant[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM tenants WHERE owner_id = ?1 ORDER BY created_at ASC")
      .bind(ownerId)
      .all<TenantRow>();
    return results.map(mapRowToTenant);
  }

  async countByOwner(ownerId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) as cnt FROM tenants WHERE owner_id = ?1")
      .bind(ownerId)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }

  /**
   * payment_mode по умолчанию 'cash_on_pickup' задаётся на уровне
   * схемы (DEFAULT в миграции 0003) — новый tenant готов принимать
   * заказы сразу после создания, без подключения Stripe Connect.
   * Это реализует требование "3-минутный онбординг без блокировок".
   */
  async create(id: string, input: CreateTenantInput): Promise<Tenant> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO tenants (id, owner_id, name, slug, currency, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`
      )
      .bind(id, input.ownerId, input.name, input.slug, input.currency ?? "UAH", now)
      .run();

    const created = await this.findById(id);
    if (!created) {
      throw new Error("Tenant creation failed: row not found after insert");
    }
    return created;
  }

  /**
   * ВАЖНО: input.telegramBotToken должен быть уже зашифрован
   * (см. src/utils/crypto.ts, encryptSecret) вызывающим кодом
   * ПЕРЕД передачей сюда. Репозиторий сохраняет то, что получил,
   * без дополнительной обработки — шифрование/расшифровка это
   * ответственность route-слоя.
   *
   * stripeUserId/stripeAccessToken НЕ принимаются этим методом —
   * они устанавливаются только через connectStripe() ниже, в рамках
   * OAuth callback, не через произвольный PATCH от клиента.
   */
  async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, unknown> = {
      name: input.name,
      logo_url: input.logoUrl,
      theme_color: input.themeColor,
      currency: input.currency,
      telegram_bot_token: input.telegramBotToken,
      telegram_chat_id: input.telegramChatId,
      notification_email: input.notificationEmail,
      notification_channels:
        input.notificationChannels !== undefined
          ? JSON.stringify(input.notificationChannels)
          : undefined,
      payment_mode: input.paymentMode,
    };

    for (const [column, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        fields.push(`${column} = ?${paramIndex}`);
        values.push(value);
        paramIndex += 1;
      }
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`Tenant ${id} not found`);
      return existing;
    }

    fields.push(`updated_at = ?${paramIndex}`);
    values.push(new Date().toISOString());
    paramIndex += 1;

    values.push(id);

    await this.db
      .prepare(`UPDATE tenants SET ${fields.join(", ")} WHERE id = ?${paramIndex}`)
      .bind(...values)
      .run();

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Tenant ${id} not found after update`);
    return updated;
  }

  async setCustomDomain(id: string, domain: string | null): Promise<void> {
    await this.db
      .prepare("UPDATE tenants SET custom_domain = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(domain, new Date().toISOString(), id)
      .run();
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db
      .prepare("UPDATE tenants SET is_active = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(isActive ? 1 : 0, new Date().toISOString(), id)
      .run();
  }

  /**
   * Сохраняет результат Stripe Connect OAuth. stripeAccessToken
   * ожидается уже зашифрованным вызывающим кодом (см. комментарий
   * к update() выше) — этот метод, как и update(), не шифрует сам.
   */
  async connectStripe(id: string, input: StripeConnectionInput): Promise<Tenant> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE tenants
         SET stripe_user_id = ?1, stripe_access_token = ?2, stripe_connected_at = ?3, updated_at = ?3
         WHERE id = ?4`
      )
      .bind(input.stripeUserId, input.stripeAccessToken, now, id)
      .run();

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Tenant ${id} not found after Stripe connect`);
    return updated;
  }

  async disconnectStripe(id: string): Promise<Tenant> {
    await this.db
      .prepare(
        `UPDATE tenants
         SET stripe_user_id = NULL, stripe_access_token = NULL, stripe_connected_at = NULL,
             payment_mode = 'cash_on_pickup', updated_at = ?1
         WHERE id = ?2`
      )
      .bind(new Date().toISOString(), id)
      .run();

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Tenant ${id} not found after Stripe disconnect`);
    return updated;
  }
}
