import type { Order } from "../types/catalog";

export interface OrderNotificationContext {
  order: Order;
  currency: string;
  tenantName: string;
}

export interface NotificationSendResult {
  channel: "email" | "telegram";
  sent: boolean;
  reason?: string | undefined;
}

/**
 * Общий контракт для канала уведомлений о заказе. Каждый провайдер
 * (Email, Telegram) реализует этот интерфейс независимо — движок
 * (NotificationService) не знает деталей форматирования конкретного
 * канала, только вызывает send() и собирает результаты.
 */
export interface NotificationChannelProvider {
  readonly channel: "email" | "telegram";
  send(context: OrderNotificationContext): Promise<NotificationSendResult>;
}
