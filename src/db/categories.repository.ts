import type { Category } from "../types/catalog";

interface CategoryRow {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

function mapRow(row: CategoryRow): Category {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export class CategoriesRepository {
  constructor(private readonly db: D1Database) {}

  async listByTenant(tenantId: string, includeInactive = false): Promise<Category[]> {
    const query = includeInactive
      ? "SELECT * FROM categories WHERE tenant_id = ?1 ORDER BY sort_order ASC"
      : "SELECT * FROM categories WHERE tenant_id = ?1 AND is_active = 1 ORDER BY sort_order ASC";
    const { results } = await this.db.prepare(query).bind(tenantId).all<CategoryRow>();
    return results.map(mapRow);
  }

  async findById(id: string, tenantId: string): Promise<Category | null> {
    const row = await this.db
      .prepare("SELECT * FROM categories WHERE id = ?1 AND tenant_id = ?2 LIMIT 1")
      .bind(id, tenantId)
      .first<CategoryRow>();
    return row ? mapRow(row) : null;
  }

  async create(
    id: string,
    tenantId: string,
    input: { name: string; sortOrder?: number | undefined }
  ): Promise<Category> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO categories (id, tenant_id, name, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(id, tenantId, input.name, input.sortOrder ?? 0, now)
      .run();

    const created = await this.findById(id, tenantId);
    if (!created) throw new Error("Category creation failed");
    return created;
  }

  async update(
    id: string,
    tenantId: string,
    input: { name?: string | undefined; sortOrder?: number | undefined; isActive?: boolean | undefined }
  ): Promise<Category> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      fields.push(`name = ?${idx}`);
      values.push(input.name);
      idx += 1;
    }
    if (input.sortOrder !== undefined) {
      fields.push(`sort_order = ?${idx}`);
      values.push(input.sortOrder);
      idx += 1;
    }
    if (input.isActive !== undefined) {
      fields.push(`is_active = ?${idx}`);
      values.push(input.isActive ? 1 : 0);
      idx += 1;
    }

    if (fields.length > 0) {
      values.push(id, tenantId);
      await this.db
        .prepare(
          `UPDATE categories SET ${fields.join(", ")} WHERE id = ?${idx} AND tenant_id = ?${idx + 1}`
        )
        .bind(...values)
        .run();
    }

    const updated = await this.findById(id, tenantId);
    if (!updated) throw new Error("Category not found after update");
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM categories WHERE id = ?1 AND tenant_id = ?2")
      .bind(id, tenantId)
      .run();
  }
}
