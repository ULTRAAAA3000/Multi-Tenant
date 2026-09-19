import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { OrdersRepository } from "../db/orders.repository";
import { ProductsRepository } from "../db/products.repository";
import { TenantsRepository } from "../db/tenants.repository";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import { requireString, optionalString } from "../utils/validation";
import { decryptSecret } from "../utils/crypto";
import { sendOrderNotification } from "../services/telegram.service";
import type { OrderStatus } from "../types/catalog";

const orders = new Hono<{ Bindings: Env }>();

const VALID_STATUSES: OrderStatus[] = ["new", "confirmed", "preparing", "completed", "canceled"];

orders.get("/", async (c) => {
  const tenant = requireTenant(c);
  const repo = new OrdersRepository(c.env.DB);
  const statusParam = c.req.query("status");
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

  const list = await repo.listByTenant(tenant.tenantId, { status });
  return c.json({ data: list });
});

orders.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  const repo = new OrdersRepository(c.env.DB);
  const order = await repo.findById(c.req.param("id"), tenant.tenantId);
  if (!order) return errorResponse(c, Errors.notFound("Order"));
  return c.json({ data: order });
});

interface RawOrderItem {
  productId?: unknown;
  quantity?: unknown;
}

orders.post("/", async (c) => {
  const tenant = requireTenant(c);
  const ordersRepo = new OrdersRepository(c.env.DB);
  const productsRepo = new ProductsRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const customerName = requireString(body.customerName, "customerName", 200);
    const customerPhone = optionalString(body.customerPhone, "customerPhone", 30);
    const customerTelegram = optionalString(body.customerTelegram, "customerTelegram", 100);
    const deliveryAddress = optionalString(body.deliveryAddress, "deliveryAddress", 500);
    const comment = optionalString(body.comment, "comment", 1000);

    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw Errors.validation('Field "items" must be a non-empty array');
    }

    const resolvedItems: Array<{
      id: string;
      productId: string;
      productName: string;
      unitPriceCents: number;
      quantity: number;
    }> = [];

    for (const rawItem of rawItems as RawOrderItem[]) {
      const productId = requireString(rawItem.productId, "items[].productId", 100);
      const quantityNum =
        typeof rawItem.quantity === "number" ? rawItem.quantity : Number(rawItem.quantity);
      if (!Number.isInteger(quantityNum) || quantityNum <= 0) {
        throw Errors.validation('Field "items[].quantity" must be a positive integer');
      }

      const product = await productsRepo.findById(productId, tenant.tenantId);
      if (!product) {
        throw Errors.validation(`Product ${productId} not found for this tenant`);
      }
      if (!product.isAvailable) {
        throw Errors.validation(`Product "${product.name}" is currently unavailable`);
      }

      resolvedItems.push({
        id: generateId(),
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: quantityNum,
      });
    }

    const created = await ordersRepo.createWithItems(
      generateId(),
      tenant.tenantId,
      { customerName, customerPhone, customerTelegram, deliveryAddress, comment },
      resolvedItems
    );

    // Уведомление в Telegram отправляется "best effort": сбой доставки
    // не должен откатывать уже сохранённый заказ. Токен бота хранится
    // в БД зашифрованным (AES-GCM) и расшифровывается только здесь,
    // в момент фактической отправки.
    const tenantsRepo = new TenantsRepository(c.env.DB);
    const tenantRecord = await tenantsRepo.findById(tenant.tenantId);

    if (tenantRecord?.telegramBotToken && tenantRecord.telegramChatId) {
      try {
        const decryptedToken = await decryptSecret(
          tenantRecord.telegramBotToken,
          c.env.TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY
        );
        await sendOrderNotification(
          {
            telegramBotToken: decryptedToken,
            telegramChatId: tenantRecord.telegramChatId,
            currency: tenantRecord.currency,
          },
          created
        );
      } catch (notifyErr) {
        // Логируем, но не проваливаем запрос — заказ уже создан.
        console.error("Failed to send Telegram notification:", notifyErr);
      }
    }

    return c.json({ data: created }, 201);
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

orders.patch("/:id/status", async (c) => {
  const tenant = requireTenant(c);
  const repo = new OrdersRepository(c.env.DB);
  const id = c.req.param("id");

  const existing = await repo.findById(id, tenant.tenantId);
  if (!existing) return errorResponse(c, Errors.notFound("Order"));

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const status = requireString(body.status, "status", 20) as OrderStatus;
    if (!VALID_STATUSES.includes(status)) {
      throw Errors.validation(`Field "status" must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const updated = await repo.updateStatus(id, tenant.tenantId, status);
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

export default orders;
