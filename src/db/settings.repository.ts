export class SettingsRepository {
  constructor(private readonly db: D1Database) {}

  async getAll(tenantId: string): Promise<Record<string, string | null>> {
    const { results } = await this.db
      .prepare("SELECT key, value FROM settings WHERE tenant_id = ?1")
      .bind(tenantId)
      .all<{ key: string; value: string | null }>();

    const map: Record<string, string | null> = {};
    for (const row of results) {
      map[row.key] = row.value;
    }
    return map;
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT value FROM settings WHERE tenant_id = ?1 AND key = ?2 LIMIT 1")
      .bind(tenantId, key)
      .first<{ value: string | null }>();
    return row?.value ?? null;
  }

  async set(tenantId: string, key: string, value: string | null): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO settings (tenant_id, key, value, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = ?3, updated_at = ?4`
      )
      .bind(tenantId, key, value, now)
      .run();
  }

  async setMany(tenantId: string, entries: Record<string, string | null>): Promise<void> {
    const now = new Date().toISOString();
    const statements = Object.entries(entries).map(([key, value]) =>
      this.db
        .prepare(
          `INSERT INTO settings (tenant_id, key, value, updated_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (tenant_id, key) DO UPDATE SET value = ?3, updated_at = ?4`
        )
        .bind(tenantId, key, value, now)
    );
    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }

  async delete(tenantId: string, key: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM settings WHERE tenant_id = ?1 AND key = ?2")
      .bind(tenantId, key)
      .run();
  }
}
