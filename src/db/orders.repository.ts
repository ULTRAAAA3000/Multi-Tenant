import type { Order, OrderItem, OrderStatus, PaymentStatus } from "../types/catalog";

interface OrderRow {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_telegram: string | null;
  delivery_address: string | null;
  comment: string | null;
  status: string;
  payment_status: string;
  payment_provider: string | null;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
}

function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerTelegram: row.customer_telegram,
    deliveryAddress: row.delivery_address,
    comment: row.comment,
    status: row.status as OrderStatus,
    paymentStatus: row.payment_status as PaymentStatus,
    paymentProvider: row.payment_provider,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderItemRow(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
  };
}

export class OrdersRepository {
  constructor(private readonly db: D1Database) {}

  async listByTenant(
    tenantId: string,
    opts: { status?: OrderStatus | undefined; limit?: number | undefined } = {}
  ): Promise<Order[]> {
    const conditions = ["tenant_id = ?1"];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (opts.status) {
      conditions.push(`status = ?${idx}`);
      values.push(opts.status);
      idx += 1;
    }

    const limit = opts.limit ?? 100;

    const { results } = await this.db
      .prepare(
        `SELECT * FROM orders WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC LIMIT ?${idx}`
      )
      .bind(...values, limit)
      .all<OrderRow>();

    return results.map(mapOrderRow);
  }

  async findById(id: string, tenantId: string): Promise<Order | null> {
    const row = await this.db
      .prepare("SELECT * FROM orders WHERE id = ?1 AND tenant_id = ?2 LIMIT 1")
      .bind(id, tenantId)
      .first<OrderRow>();
    if (!row) return null;

    const order = mapOrderRow(row);
    order.items = await this.getItems(order.id);
    return order;
  }

  async getItems(orderId: string): Promise<OrderItem[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM order_items WHERE order_id = ?1")
      .bind(orderId)
      .all<OrderItemRow>();
    return results.map(mapOrderItemRow);
  }

  /**
   * Создаёт заказ вместе с позициями атомарно через D1 batch API.
   * Цена и название товара берутся снимком на момент заказа
   * (см. комментарий к схеме order_items).
   */
  async createWithItems(
    orderId: string,
    tenantId: string,
    input: {
      customerName: string;
      customerPhone?: string | null | undefined;
      customerTelegram?: string | null | undefined;
      deliveryAddress?: string | null | undefined;
      comment?: string | null | undefined;
    },
    items: Array<{ id: string; productId: string; productName: string; unitPriceCents: number; quantity: number }>
  ): Promise<Order> {
    const now = new Date().toISOString();
    const totalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

    const statements = [
      this.db
        .prepare(
          `INSERT INTO orders
             (id, tenant_id, customer_name, customer_phone, customer_telegram,
              delivery_address, comment, total_cents, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`
        )
        .bind(
          orderId,
          tenantId,
          input.customerName,
          input.customerPhone ?? null,
          input.customerTelegram ?? null,
          input.deliveryAddress ?? null,
          input.comment ?? null,
          totalCents,
          now
        ),
      ...items.map((item) =>
        this.db
          .prepare(
            `INSERT INTO order_items
               (id, order_id, product_id, product_name, unit_price_cents, quantity)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
          )
          .bind(item.id, orderId, item.productId, item.productName, item.unitPriceCents, item.quantity)
      ),
    ];

    await this.db.batch(statements);

    const created = await this.findById(orderId, tenantId);
    if (!created) throw new Error("Order creation failed");
    return created;
  }

  async updateStatus(id: string, tenantId: string, status: OrderStatus): Promise<Order> {
    await this.db
      .prepare(
        "UPDATE orders SET status = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4"
      )
      .bind(status, new Date().toISOString(), id, tenantId)
      .run();

    const updated = await this.findById(id, tenantId);
    if (!updated) throw new Error("Order not found after update");
    return updated;
  }

  async updatePaymentStatus(
    id: string,
    tenantId: string,
    paymentStatus: PaymentStatus,
    paymentProvider?: string | null
  ): Promise<Order> {
    await this.db
      .prepare(
        `UPDATE orders SET payment_status = ?1, payment_provider = ?2, updated_at = ?3
         WHERE id = ?4 AND tenant_id = ?5`
      )
      .bind(paymentStatus, paymentProvider ?? null, new Date().toISOString(), id, tenantId)
      .run();

    const updated = await this.findById(id, tenantId);
    if (!updated) throw new Error("Order not found after update");
    return updated;
  }
}
