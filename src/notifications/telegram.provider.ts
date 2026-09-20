import type {
  NotificationChannelProvider,
  OrderNotificationContext,
  NotificationSendResult,
} from "./channel.interface";
import { sendOrderNotification } from "../services/telegram.service";

/**
 * Обёртка вокруг существующего Telegram-сервиса (Фаза 3) под общий
 * NotificationChannelProvider интерфейс. Логика форматирования и
 * отправки не дублируется — telegram.service.ts остаётся единственным
 * местом, знающим детали Telegram Bot API.
 */
export class TelegramNotificationProvider implements NotificationChannelProvider {
  readonly channel = "telegram" as const;

  constructor(
    private readonly botToken: string,
    private readonly chatId: string
  ) {}

  async send(context: OrderNotificationContext): Promise<NotificationSendResult> {
    const result = await sendOrderNotification(
      {
        telegramBotToken: this.botToken,
        telegramChatId: this.chatId,
        currency: context.currency,
      },
      context.order
    );

    return {
      channel: "telegram",
      sent: result.sent,
      reason: result.reason,
    };
  }
}
