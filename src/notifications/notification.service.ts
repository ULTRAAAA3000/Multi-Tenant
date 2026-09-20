import type { Env } from "../types/env";
import type { Order } from "../types/catalog";
import type { Tenant } from "../types/tenant";
import { EmailNotificationProvider } from "./email.provider";
import { TelegramNotificationProvider } from "./telegram.provider";
import { decryptSecret } from "../utils/crypto";
import type { NotificationChannelProvider, NotificationSendResult } from "./channel.interface";

/**
 * NotificationService — единая точка входа для рассылки уведомления
 * о заказе по всем каналам, активным для конкретного tenant
 * (tenant.notificationChannels). Каждый канал независим: сбой одного
 * не должен блокировать остальные (см. Promise.allSettled ниже).
 *
 * ПРИМЕЧАНИЕ про WebSoundProvider из исходного запроса: звуковой
 * сигнал и toast в дашборде — это то, как УЖЕ ДОСТАВЛЕННОЕ уведомление
 * отображается в браузере владельца, а не отдельный канал ДОСТАВКИ,
 * которым управляет бэкенд. Backend физически не может "отправить
 * звук" в чужой открытый браузер напрямую — только через какой-то
 * транспорт (WebSocket-соединение, которое дашборд держит открытым,
 * или regular polling GET /admin/orders?since=...). Раз дашборда
 * (Фаза 5 UI) ещё нет, здесь этот слой не реализован — это задача
 * фронтенда дашборда, слушающего новые заказы и проигрывающего звук
 * на своей стороне, когда список заказов меняется. NotificationService
 * ниже занимается только доставкой на внешние каналы (email/telegram).
 */
export class NotificationService {
  constructor(private readonly env: Env) {}

  private async buildProviders(
    tenant: Pick<Tenant, "notificationChannels" | "notificationEmail" | "telegramBotToken" | "telegramChatId">
  ): Promise<NotificationChannelProvider[]> {
    const providers: NotificationChannelProvider[] = [];

    if (tenant.notificationChannels.includes("email")) {
      if (!tenant.notificationEmail) {
        console.warn("Email channel enabled but notification_email is not set — skipping");
      } else if (!this.env.RESEND_API_KEY) {
        console.warn("Email channel enabled but RESEND_API_KEY is not configured — skipping");
      } else {
        // Тестовый режим Resend: onboarding@resend.dev может отправлять
        // письма только на email владельца аккаунта Resend. В продакшене
        // FROM_EMAIL должен быть заменён на верифицированный домен
        // (см. .env / wrangler secret NOTIFICATION_FROM_EMAIL).
        const fromAddress = this.env.NOTIFICATION_FROM_EMAIL ?? "onboarding@resend.dev";
        providers.push(
          new EmailNotificationProvider(
            this.env.RESEND_API_KEY,
            fromAddress,
            tenant.notificationEmail
          )
        );
      }
    }

    if (tenant.notificationChannels.includes("telegram")) {
      if (!tenant.telegramBotToken || !tenant.telegramChatId) {
        // Telegram теперь опционален по дизайну — отсутствие настройки
        // не логируется как warning, это ожидаемое штатное состояние.
      } else {
        try {
          const decryptedToken = await decryptSecret(
            tenant.telegramBotToken,
            this.env.TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY
          );
          providers.push(new TelegramNotificationProvider(decryptedToken, tenant.telegramChatId));
        } catch (err) {
          console.error("Failed to decrypt Telegram bot token:", err);
        }
      }
    }

    return providers;
  }

  /**
   * Отправляет уведомление о заказе по всем активным каналам tenant.
   * Best-effort по каждому каналу независимо — используется
   * Promise.allSettled, а не Promise.all, чтобы сбой одного канала
   * (например, Resend API недоступен) не прервал отправку в остальные.
   */
  async notifyNewOrder(
    tenant: Pick<
      Tenant,
      "name" | "currency" | "notificationChannels" | "notificationEmail" | "telegramBotToken" | "telegramChatId"
    >,
    order: Order
  ): Promise<NotificationSendResult[]> {
    const providers = await this.buildProviders(tenant);

    if (providers.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      providers.map((provider) =>
        provider.send({ order, currency: tenant.currency, tenantName: tenant.name })
      )
    );

    return settled.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      // Провайдер сам должен ловить свои ошибки и возвращать
      // { sent: false, reason }, но на случай необработанного
      // исключения — фоллбэк, чтобы не потерять весь массив результатов.
      console.error("Notification provider threw unexpectedly:", result.reason);
      return {
        channel: providers[index]?.channel ?? "email",
        sent: false,
        reason: "Unexpected provider error",
      } as NotificationSendResult;
    });
  }
}
