import type { Tenant, CreateTenantInput, UpdateTenantInput } from "../types/tenant";

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
  created_at: string;
  updated_at: string;
}

function mapRowToTenant(row: TenantRow): Tenant {
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
}
