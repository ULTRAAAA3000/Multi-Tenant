import type { Product, CreateProductInput } from "../types/catalog";

interface ProductRow {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    isAvailable: row.is_available === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProductsRepository {
  constructor(private readonly db: D1Database) {}

  async listByTenant(
    tenantId: string,
    opts: { onlyAvailable?: boolean | undefined; categoryId?: string | undefined } = {}
  ): Promise<Product[]> {
    const conditions = ["tenant_id = ?1"];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (opts.onlyAvailable) {
      conditions.push("is_available = 1");
    }
    if (opts.categoryId) {
      conditions.push(`category_id = ?${idx}`);
      values.push(opts.categoryId);
      idx += 1;
    }

    const { results } = await this.db
      .prepare(
        `SELECT * FROM products WHERE ${conditions.join(" AND ")} ORDER BY sort_order ASC`
      )
      .bind(...values)
      .all<ProductRow>();

    return results.map(mapRow);
  }

  async findById(id: string, tenantId: string): Promise<Product | null> {
    const row = await this.db
      .prepare("SELECT * FROM products WHERE id = ?1 AND tenant_id = ?2 LIMIT 1")
      .bind(id, tenantId)
      .first<ProductRow>();
    return row ? mapRow(row) : null;
  }

  async countByTenant(tenantId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) as cnt FROM products WHERE tenant_id = ?1")
      .bind(tenantId)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }

  async create(id: string, tenantId: string, input: CreateProductInput): Promise<Product> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO products
           (id, tenant_id, category_id, name, description, price_cents,
            image_url, is_available, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
      )
      .bind(
        id,
        tenantId,
        input.categoryId ?? null,
        input.name,
        input.description ?? null,
        input.priceCents,
        input.imageUrl ?? null,
        input.isAvailable === false ? 0 : 1,
        input.sortOrder ?? 0,
        now
      )
      .run();

    const created = await this.findById(id, tenantId);
    if (!created) throw new Error("Product creation failed");
    return created;
  }

  async update(
    id: string,
    tenantId: string,
    input: {
      categoryId?: string | null | undefined;
      name?: string | undefined;
      description?: string | null | undefined;
      priceCents?: number | undefined;
      imageUrl?: string | null | undefined;
      isAvailable?: boolean | undefined;
      sortOrder?: number | undefined;
    }
  ): Promise<Product> {
    const fieldMap: Record<string, unknown> = {
      category_id: input.categoryId,
      name: input.name,
      description: input.description,
      price_cents: input.priceCents,
      image_url: input.imageUrl,
      is_available:
        input.isAvailable === undefined ? undefined : input.isAvailable ? 1 : 0,
      sort_order: input.sortOrder,
    };

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [column, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        fields.push(`${column} = ?${idx}`);
        values.push(value);
        idx += 1;
      }
    }

    if (fields.length > 0) {
      fields.push(`updated_at = ?${idx}`);
      values.push(new Date().toISOString());
      idx += 1;

      values.push(id, tenantId);
      await this.db
        .prepare(
          `UPDATE products SET ${fields.join(", ")} WHERE id = ?${idx} AND tenant_id = ?${idx + 1}`
        )
        .bind(...values)
        .run();
    }

    const updated = await this.findById(id, tenantId);
    if (!updated) throw new Error("Product not found after update");
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM products WHERE id = ?1 AND tenant_id = ?2")
      .bind(id, tenantId)
      .run();
  }
}
