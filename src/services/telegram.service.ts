import type { Order } from "../types/catalog";
import type { Tenant } from "../types/tenant";

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
}

export class TelegramServiceError extends Error {
  constructor(
    message: string,
    public readonly telegramErrorCode?: number
  ) {
    super(message);
    this.name = "TelegramServiceError";
  }
}

/**
 * Форматирует заказ в человекочитаемое Telegram-сообщение
 * с MarkdownV2-разметкой. Экранирует спецсимволы MarkdownV2,
 * т.к. имена товаров/клиентов — произвольный пользовательский ввод.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function formatOrderMessage(order: Order, currency: string): string {
  const lines: string[] = [];

  lines.push(`🆕 *New order* \\#${escapeMarkdownV2(order.id.slice(0, 8))}`);
  lines.push("");
  lines.push(`👤 *Customer:* ${escapeMarkdownV2(order.customerName)}`);

  if (order.customerPhone) {
    lines.push(`📞 *Phone:* ${escapeMarkdownV2(order.customerPhone)}`);
  }
  if (order.customerTelegram) {
    lines.push(`✈️ *Telegram:* ${escapeMarkdownV2(order.customerTelegram)}`);
  }
  if (order.deliveryAddress) {
    lines.push(`📍 *Address:* ${escapeMarkdownV2(order.deliveryAddress)}`);
  }

  lines.push("");
  lines.push("🛒 *Items:*");

  for (const item of order.items ?? []) {
    const lineTotal = formatPrice(item.unitPriceCents * item.quantity, currency);
    lines.push(
      `• ${escapeMarkdownV2(item.productName)} × ${item.quantity} — ${escapeMarkdownV2(lineTotal)}`
    );
  }

  lines.push("");
  lines.push(`💰 *Total: ${escapeMarkdownV2(formatPrice(order.totalCents, currency))}*`);

  if (order.comment) {
    lines.push("");
    lines.push(`💬 *Comment:* ${escapeMarkdownV2(order.comment)}`);
  }

  return lines.join("\n");
}

/**
 * Отправляет уведомление о заказе в Telegram-чат владельца tenant.
 * Не бросает исключение при отсутствии токена/chat_id — заказ должен
 * успешно создаться в БД даже если владелец ещё не подключил бота
 * (уведомление в этом случае просто не отправляется).
 */
export async function sendOrderNotification(
  tenant: Pick<Tenant, "telegramBotToken" | "telegramChatId" | "currency">,
  order: Order
): Promise<{ sent: boolean; reason?: string }> {
  if (!tenant.telegramBotToken || !tenant.telegramChatId) {
    return { sent: false, reason: "Telegram bot not configured for this tenant" };
  }

  const message = formatOrderMessage(order, tenant.currency);
  const url = `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: tenant.telegramChatId,
      text: message,
      parse_mode: "MarkdownV2",
    }),
  });

  const result = (await response.json()) as TelegramSendMessageResponse;

  if (!result.ok) {
    // Не бросаем — заказ уже сохранён, ошибка доставки уведомления
    // не должна откатывать бизнес-транзакцию. Логируем для видимости.
    console.error(
      `Telegram notification failed for tenant chat ${tenant.telegramChatId}: ${result.description}`
    );
    return { sent: false, reason: result.description ?? "Unknown Telegram API error" };
  }

  return { sent: true };
}
