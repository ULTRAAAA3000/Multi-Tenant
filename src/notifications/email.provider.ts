import type {
  NotificationChannelProvider,
  OrderNotificationContext,
  NotificationSendResult,
} from "./channel.interface";

interface ResendSendResponse {
  id?: string;
  message?: string; // поле сообщения об ошибке в ответе Resend
}

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(context: OrderNotificationContext): string {
  const { order, currency, tenantName } = context;

  const itemsHtml = (order.items ?? [])
    .map((item) => {
      const lineTotal = formatPrice(item.unitPriceCents * item.quantity, currency);
      return `<tr>
        <td style="padding:6px 0;">${escapeHtml(item.productName)} × ${item.quantity}</td>
        <td style="padding:6px 0; text-align:right;">${escapeHtml(lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const contactLines: string[] = [];
  if (order.customerPhone) contactLines.push(`Phone: ${escapeHtml(order.customerPhone)}`);
  if (order.customerTelegram) contactLines.push(`Telegram: ${escapeHtml(order.customerTelegram)}`);
  if (order.deliveryAddress) contactLines.push(`Address: ${escapeHtml(order.deliveryAddress)}`);

  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">New order — ${escapeHtml(tenantName)}</h2>
      <p style="color:#666; margin-top:0;">Order #${escapeHtml(order.id.slice(0, 8))}</p>

      <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
      ${contactLines.length > 0 ? `<p>${contactLines.join("<br>")}</p>` : ""}

      <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
        ${itemsHtml}
        <tr style="border-top: 1px solid #ddd; font-weight: bold;">
          <td style="padding:8px 0;">Total</td>
          <td style="padding:8px 0; text-align:right;">${escapeHtml(formatPrice(order.totalCents, currency))}</td>
        </tr>
      </table>

      <p style="margin-top: 16px; color:#666;">
        Payment status: <strong>${escapeHtml(order.paymentStatus)}</strong>
      </p>

      ${order.comment ? `<p><strong>Note:</strong> ${escapeHtml(order.comment)}</p>` : ""}
    </div>
  `;
}

/**
 * Email-канал через Resend API. Основной канал уведомлений для
 * европейского рынка — не требует от владельца заведения ничего
 * настраивать вручную (в отличие от Telegram, который требует
 * создания бота), достаточно указать notification_email при онбординге.
 */
export class EmailNotificationProvider implements NotificationChannelProvider {
  readonly channel = "email" as const;

  constructor(
    private readonly resendApiKey: string,
    private readonly fromAddress: string,
    private readonly toAddress: string
  ) {}

  async send(context: OrderNotificationContext): Promise<NotificationSendResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: this.toAddress,
          subject: `New order #${context.order.id.slice(0, 8)} — ${context.tenantName}`,
          html: buildEmailHtml(context),
        }),
      });

      const result = (await response.json()) as ResendSendResponse;

      if (!response.ok) {
        console.error(`Resend email failed for ${this.toAddress}: ${result.message}`);
        return {
          channel: "email",
          sent: false,
          reason: result.message ?? "Resend API error",
        };
      }

      return { channel: "email", sent: true };
    } catch (err) {
      // Сетевая ошибка/таймаут — не бросаем, чтобы не завалить
      // Worker и не откатить уже сохранённый заказ.
      console.error("Email notification request failed:", err);
      return {
        channel: "email",
        sent: false,
        reason: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
